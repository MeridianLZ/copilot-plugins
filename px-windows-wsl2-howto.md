Yes. **Do not duplicate the credential or run a second Px inside Ubuntu unless you have a compelling reason.** The cleaner architecture is to keep the one working Windows Px instance—where Windows Credential Manager already owns the secret—and make WSL2 consume that local proxy.

That conclusion is supported by current Microsoft WSL networking docs and current Px configuration docs. Microsoft explicitly documents WSL→Windows-host access, and Px explicitly supports selecting its listening interface and controlling allowed clients. citeturn333807view1turn333807view0 

Context7 still has no WSL or `genotrance/px` index, so there is no honest Context7 corroboration available for this topic.

## Architecture

You currently have:

```text
Windows
─────────────────────────────────────

Git/npm/etc.
    │
    ▼
127.0.0.1:3128
    │
    ▼
Px
    │
    ├── username
    ├── Credential Manager password
    │
    ▼
Corporate Proxy
```

What we want is:

```text
Windows                                WSL2 Ubuntu
──────────────────────────────         ─────────────────────

Credential Manager
       │
       ▼
      Px  ◄──────────────────────────── HTTP_PROXY
       │                                HTTPS_PROXY
       │
       ▼
Corporate Proxy
```

**One Px. One credential. One authentication point.**

---

# Step 1 — determine your WSL networking mode

From **Windows PowerShell**:

```powershell
wsl --version
```

Then:

```powershell
Get-Content "$HOME\.wslconfig" -ErrorAction SilentlyContinue
```

Look specifically for:

```ini
[wsl2]
networkingMode=mirrored
```

If that is absent, assume normal NAT/virtio-proxy style networking unless your corporate image has configured something else.

This matters because Microsoft documents two distinct WSL→Windows paths:

- **Mirrored networking:** Linux can theoretically reach Windows services through `127.0.0.1`.
- **NAT networking:** Linux reaches the Windows host through the Windows-side gateway IP. citeturn433820search3turn433820search0

## I recommend NAT-host-address access for this

Even if you currently use mirrored networking, I would **not architect your proxy setup around WSL→Windows `127.0.0.1` right now**.

Why?

There is an **open April 2026 WSL bug** specifically involving WSL 2.6.3 and Ubuntu 26.04 where WSL→Windows TCP connections through localhost fail in mirrored mode. citeturn930361search5

There are also other recent WSL reports involving local proxy ports and mirrored networking. citeturn930361search9turn930361search4

Microsoft's documentation says localhost should work, but current field evidence says this path remains problematic on some configurations. citeturn433820search3

So we'll use the more explicit path.

---

# Step 2 — from Ubuntu, identify Windows as seen by WSL

Inside **Ubuntu WSL2**:

```bash
ip route show default
```

You'll see something conceptually like:

```text
default via 172.24.64.1 dev eth0
```

Extract just the Windows host gateway:

```bash
WIN_HOST="$(ip route show default | awk '{print $3; exit}')"
printf '%s\n' "$WIN_HOST"
```

Microsoft explicitly documents this method:

```bash
ip route show | grep -i default | awk '{ print $3}'
```

as the Windows machine's address from the perspective of WSL2. citeturn433820search3

For the rest of this walkthrough I'll refer to it as:

```text
$WIN_HOST
```

No need to tell me its actual value.

---

# Step 3 — verify Px's existing Windows binding

Back in **Windows PowerShell**:

```powershell
Get-NetTCPConnection -LocalPort 3128 -State Listen |
    Format-Table LocalAddress,LocalPort,OwningProcess
```

Your working Windows-only configuration is probably:

```text
LocalAddress  LocalPort
------------  ---------
127.0.0.1     3128
```

If so, **WSL NAT cannot reach it**.

That is expected.

Microsoft specifically notes that WSL→Windows connections under NAT need the Windows host address; Windows loopback is not the same loopback namespace. citeturn433820search0turn433820search3

---

# Step 4 — make Px reachable from WSL

Current Px exposes:

```text
--listen=IP
--gateway=0|1
--allow=IPGLOB
```

Its default listener is:

```text
127.0.0.1
```

and default port is:

```text
3128
```



There are two approaches.

### Preferred controlled approach

Bind Px to the Windows-side address reachable by WSL rather than indiscriminately exposing it.

First identify Windows WSL-facing addresses:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.InterfaceAlias -match 'WSL|Hyper-V|vEthernet'
    } |
    Format-Table InterfaceAlias,IPAddress,PrefixLength
```

Then configure Px with that specific listener.

Conceptually:

```powershell
px `
  --listen='<WINDOWS_WSL_ADDRESS>' `
  --port=3128 `
  --save
```

Do **not** change your existing proxy server/username/auth configuration.

We're only changing:

```text
proxy:listen
```

Current Px's documented default is `127.0.0.1`, and `--listen=IP` exists specifically to select the local listening interface. 

Restart Px:

```powershell
px --restart
```

Then verify:

```powershell
Get-NetTCPConnection -LocalPort 3128 -State Listen |
    Format-Table LocalAddress,LocalPort,OwningProcess
```

You should now see the WSL-reachable Windows address.

---

# Step 5 — test the TCP connection from WSL

Back inside Ubuntu:

```bash
WIN_HOST="$(ip route show default | awk '{print $3; exit}')"

curl -v \
  --connect-timeout 5 \
  --proxy "http://${WIN_HOST}:3128" \
  http://example.com/
```

We're **not touching any environment variables yet**.

This is simply:

```text
WSL curl
    │
    ▼
Windows-host-IP:3128
    │
    ▼
Px
```

If Px is reachable, curl should at minimum establish the connection to Px.

Then test HTTPS:

```bash
curl -v \
  --connect-timeout 10 \
  --max-time 20 \
  --proxy "http://${WIN_HOST}:3128" \
  https://registry.npmjs.org/-/ping
```

That proves the complete chain:

```text
Ubuntu
  ↓
Windows Px
  ↓
Corporate proxy
  ↓
npm registry
```

---

# Step 6 — if Windows Firewall blocks it

This is very plausible in your environment.

Microsoft explicitly documents that enterprise Windows Defender Firewall policies can prevent WSL networking, particularly when local firewall-rule merging is disabled. citeturn333807view0

Test from WSL:

```bash
nc -vz "$WIN_HOST" 3128
```

or, if `nc` isn't installed:

```bash
curl -v \
  --connect-timeout 3 \
  "http://${WIN_HOST}:3128"
```

If Px is listening correctly on Windows but WSL can't establish TCP, check Windows:

```powershell
Get-NetFirewallProfile |
    Format-Table Name,Enabled,DefaultInboundAction,AllowLocalFirewallRules
```

I would **not start creating firewall exceptions blindly** in your locked-down financial environment.

If corporate policy blocks Hyper-V/WSL inbound traffic, that's an IT-policy issue rather than a Px issue. Microsoft calls this scenario out explicitly. citeturn333807view0

---

# Step 7 — once curl succeeds, set Ubuntu proxy variables

Only now:

```bash
export HTTP_PROXY="http://${WIN_HOST}:3128"
export HTTPS_PROXY="http://${WIN_HOST}:3128"

export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
```

I recommend setting both cases because Linux tools are inconsistent about which variant they honor.

Microsoft's own WSL `autoProxy` feature sets both uppercase and lowercase forms for precisely this reason. citeturn333807view0

Verify:

```bash
env | grep -i proxy
```

Your output should contain only the credential-free local endpoint:

```text
HTTP_PROXY=http://172.x.x.1:3128
HTTPS_PROXY=http://172.x.x.1:3128

http_proxy=http://172.x.x.1:3128
https_proxy=http://172.x.x.1:3128
```

**No username. No password. No Base64 credential.**

---

# Step 8 — test the Ubuntu development stack

First:

```bash
curl -I https://registry.npmjs.org/
```

Then npm:

```bash
npm ping
```

Then pnpm:

```bash
pnpm view react version
```

Then uv:

```bash
uv self version
```

Networked uv test:

```bash
uvx --isolated ruff --version
```

Then Git:

```bash
git ls-remote https://github.com/git/git.git HEAD
```

All of these should now be:

```text
Linux process
       │
       ▼
HTTP_PROXY
       │
       ▼
Windows Px
       │
       ▼
corporate authenticated proxy
```

---

# Step 9 — make it persistent without hardcoding a changing WSL gateway

I **would not** put:

```bash
export HTTP_PROXY=http://172.24.64.1:3128
```

into `.bashrc`.

The WSL NAT gateway can change.

Instead:

```bash
#!/usr/bin/env bash

WIN_HOST="$(ip route show default | awk '{print $3; exit}')"

if [[ -n "${WIN_HOST}" ]]; then
    export HTTP_PROXY="http://${WIN_HOST}:3128"
    export HTTPS_PROXY="${HTTP_PROXY}"

    export http_proxy="${HTTP_PROXY}"
    export https_proxy="${HTTPS_PROXY}"
fi
```

Put that into a separate file such as:

```text
~/.config/proxy/windows-px.sh
```

and source it:

```bash
source "$HOME/.config/proxy/windows-px.sh"
```

from `.bashrc` or your shell bootstrap.

This preserves the dynamic Windows-host lookup.

---

# There is also Microsoft's `autoProxy`

Current WSL has:

```ini
[wsl2]
autoProxy=true
```

Microsoft says that when enabled, WSL reads the **Windows HTTP proxy configuration** and automatically injects:

```text
HTTP_PROXY
HTTPS_PROXY
NO_PROXY

http_proxy
https_proxy
no_proxy
```

into Linux. citeturn333807view0

At first glance this looks perfect.

However, I'm **not recommending it as our first implementation** for Px because your Windows proxy endpoint is localhost:

```text
127.0.0.1:3128
```

and Microsoft/WSL still has active issues involving localhost proxy mirroring, particularly under NAT/mirrored networking combinations. citeturn930361search1turn930361search3turn930361search9

Once the explicit host-IP route works, we can experiment with `autoProxy=true` as an optimization.

---

# One important security improvement

Do **not install Px inside Ubuntu** yet.

Running another Px instance there would require either:

```text
credential copied into Linux keyring
```

or:

```text
PX_PASSWORD in Linux
```

or another secret-storage mechanism.

That defeats the nice property we've just achieved:

```text
                        SECRET BOUNDARY
                              │
                              ▼
Ubuntu ──────────────► Windows Px ──────► corporate proxy
no secret              Credential
                       Manager
```

The current Px docs explicitly say Windows Credential Manager is the recommended Windows backend; Linux requires a separate keyring backend or `PX_PASSWORD`. 

So the **SOTA architecture for your case is one Windows Px instance shared by Windows + WSL**, not two copies.

The immediate next test is just:

```bash
WIN_HOST="$(ip route show default | awk '{print $3; exit}')"

curl -v \
  --proxy "http://${WIN_HOST}:3128" \
  --connect-timeout 5 \
  --max-time 20 \
  https://registry.npmjs.org/-/ping
```

If that cannot connect to Px, **do not touch Ubuntu's npm/git/uv settings**. The next boundary is solely Px's Windows listener/firewall.
