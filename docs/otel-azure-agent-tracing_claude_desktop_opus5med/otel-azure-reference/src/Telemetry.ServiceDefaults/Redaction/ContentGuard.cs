using System.Diagnostics;
using System.Text.RegularExpressions;
using OpenTelemetry;

namespace Telemetry.ServiceDefaults.Redaction;

public readonly record struct RedactionResult(string Text, int HitCount);

public interface IContentRedactor
{
    RedactionResult Redact(string input);
}

/// <summary>
/// Pattern-based redaction. Deliberately conservative and deliberately dumb:
/// this is a backstop, not a guarantee. The real control is
/// ContentCapture.None, which never puts the text in the span at all.
///
/// Ordering matters — longer/more specific patterns run first so a card number
/// is not partially eaten by the generic long-digit rule.
/// </summary>
public sealed partial class RegexContentRedactor : IContentRedactor
{
    private static readonly (Regex Pattern, string Replacement)[] Rules =
    [
        (Pan(),        "[REDACTED:PAN]"),
        (Iban(),       "[REDACTED:IBAN]"),
        (Ssn(),        "[REDACTED:SSN]"),
        (Email(),      "[REDACTED:EMAIL]"),
        (BearerToken(),"[REDACTED:TOKEN]"),
        (ConnString(), "[REDACTED:SECRET]"),
        (LongDigits(), "[REDACTED:NUMBER]"),
    ];

    public RedactionResult Redact(string input)
    {
        if (string.IsNullOrEmpty(input)) return new(input, 0);

        var hits = 0;
        var text = input;

        foreach (var (pattern, replacement) in Rules)
        {
            text = pattern.Replace(text, m => { hits++; return replacement; });
        }

        return new RedactionResult(text, hits);
    }

    // 13-19 digits with optional separators — card numbers.
    [GeneratedRegex(@"\b(?:\d[ -]*?){13,19}\b", RegexOptions.Compiled)]
    private static partial Regex Pan();

    [GeneratedRegex(@"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", RegexOptions.Compiled)]
    private static partial Regex Iban();

    [GeneratedRegex(@"\b\d{3}-\d{2}-\d{4}\b", RegexOptions.Compiled)]
    private static partial Regex Ssn();

    [GeneratedRegex(@"\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b", RegexOptions.Compiled)]
    private static partial Regex Email();

    [GeneratedRegex(@"\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}", RegexOptions.Compiled)]
    private static partial Regex BearerToken();

    [GeneratedRegex(@"(?i)\b(?:password|pwd|secret|apikey|api_key|accountkey|sharedaccesskey)\s*=\s*[^\s;]+", RegexOptions.Compiled)]
    private static partial Regex ConnString();

    // Catch-all for anything 12+ digits that survived the specific rules.
    [GeneratedRegex(@"\b\d{12,}\b", RegexOptions.Compiled)]
    private static partial Regex LongDigits();
}

/// <summary>
/// Enforces capture mode on spans produced by instrumentation we do not own —
/// the Azure SDK, Agent Framework, Semantic Kernel, SqlClient. Those libraries
/// decide for themselves what to attach; this is where we take it back.
///
/// Runs on OnEnd so it sees the fully-populated span. Cost is proportional to
/// tag count, so keep the scanned-key set narrow.
/// </summary>
public sealed class ContentGuardProcessor(
    TelemetryOptions options,
    IContentRedactor redactor) : BaseProcessor<Activity>
{
    /// <summary>
    /// Tag keys known to carry free text that may contain sensitive data.
    /// Anything not listed is left alone — an allowlist of things to scrub,
    /// not a blocklist of things to keep.
    /// </summary>
    private static readonly string[] ContentBearingKeys =
    [
        Sem.Db.QueryText,
        "gen_ai.prompt",
        "gen_ai.completion",
        "gen_ai.input.messages",
        "gen_ai.output.messages",
        "gen_ai.system_instructions",
        "url.full",
        "url.query",
    ];

    public override void OnEnd(Activity activity)
    {
        if (options.Capture == ContentCapture.Full) return;

        foreach (var key in ContentBearingKeys)
        {
            var existing = activity.GetTagItem(key);
            if (existing is not string s || s.Length == 0) continue;

            if (options.Capture == ContentCapture.None)
            {
                activity.SetTag(key, null);                     // drop
                activity.SetTag($"{key}.length", s.Length);     // keep the shape
            }
            else // Redacted
            {
                var result = redactor.Redact(s);
                activity.SetTag(key, result.Text);
                if (result.HitCount > 0)
                {
                    activity.SetTag(Sem.Internal.RedactionApplied, true);
                    activity.SetTag(Sem.Internal.RedactionHitCount, result.HitCount);
                }
            }
        }
    }
}
