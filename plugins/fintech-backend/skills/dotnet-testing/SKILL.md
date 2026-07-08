---
name: dotnet-testing
description: .NET testing reference — xUnit conventions, Testcontainers for SQL Server and the Service Bus emulator, WebApplicationFactory, property-based money tests, and the compliance test suite. Consult when writing or reviewing any backend test.
---

# .NET Testing

## Stack
xUnit · FluentAssertions · Testcontainers · FsCheck (property-based) · NSubstitute sparingly — prefer real implementations behind containers over mocks.

## Integration fixture
```csharp
public sealed class ApiFixture : IAsyncLifetime
{
    public MsSqlContainer Sql { get; } =
        new MsSqlBuilder().WithImage("mcr.microsoft.com/mssql/server:2022-latest").Build();
    public ServiceBusEmulatorContainer Bus { get; } = /* topology config json */;
    public WebApplicationFactory<Program> Factory = null!;
    // InitializeAsync: start containers, apply the shipped idempotent migration script, build the factory
}
```
Tests apply the **same migration SQL artifact that ships to production**, so test/prod schema drift is impossible by construction. Auth uses a test authentication handler minting claims per case — and every endpoint test asserts the 401 and 403 paths, not just 200.

## Money is property-tested, not example-tested
FsCheck properties: allocation across n parts sums exactly to the input; rounding follows the stated rule; decimal round-trips lose no precision; for the ledger, entries sum to zero per currency and a reversal restores the prior balance exactly.

## Messaging tests
State change and outbox row commit together (kill before dispatch → the row survives unsent); duplicate `MessageId` processes once; poison messages land in the DLQ with a reason; a saga killed mid-flight recovers and compensates.

## Compliance suite (`tests/Compliance.Tests`)
Reflection-driven, fails the build when: any endpoint lacks a named authorization policy · any DTO property matching the sensitive-name pattern lacks masking attributes · any mutating endpoint lacks idempotency handling · any money property isn't configured as the correct decimal precision · any ledger entity exposes an update or delete path.

## Conventions
`MethodUnderTest_Scenario_Expected` naming · `TimeProvider` faked, never `DateTime.Now` · no `Task.Delay` waits, poll with timeout helpers · builders plus tokenized fixtures for test data.
