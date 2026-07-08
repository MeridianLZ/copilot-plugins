---
name: k8s-onprem-deploy
description: On-prem Kubernetes deployment reference — Helm chart layout, Kustomize overlays, External Secrets, NetworkPolicies, pod security, probes, .NET resource tuning, change-ticket admission. Consult for any manifest, chart, values, ingress, secret-mount, or rollout question.
---

# On-Prem Kubernetes Deploy

Cluster mutations are **CI-only** and hook-blocked locally. Validate with `helm template | kubeconform -strict`, `helm lint`, `kustomize build`, and read-only `kubectl get/describe`.

## Layout per service
```
deploy/
├── chart/                 # Deployment, Service, HPA, PDB, NetworkPolicy, ServiceMonitor
│   ├── Chart.yaml
│   ├── values.yaml        # dev defaults, zero secrets
│   └── templates/
└── overlays/{dev,uat,prod}/   # replicas, resources, hostnames, change-ticket annotation
```

## Workload baseline
`securityContext`: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`, drop ALL capabilities · startup + liveness (`/healthz/live`) + readiness (`/healthz/ready`, including SQL and Service Bus checks) probes · requests **and** limits always.

**.NET specifics**: configure GC heap limits consistent with the container memory limit — the default GC assumes it can use far more than the cgroup allows and you get OOMKills under load rather than back-pressure. Set a startup probe generous enough for cold start plus JIT.

Payment-path services: `maxUnavailable: 0`, PDB `minAvailable: 1`, topology spread across the two AZ racks.

## Secrets
External Secrets Operator against the on-prem vault → generated `Secret` → `envFrom`. No literals in YAML — the write hook rejects them.

## Network
Default-deny ingress and egress per namespace. Explicit egress: Service Bus AMQPS 5671, SQL 1433, vault, OTel collector 4317. Service-to-service mTLS via the mesh; ingress only through the internal gateway.

## Images
Internal registry only, Alpine or distroless, pinned by digest — never a floating tag in any environment.

## Change control
Prod overlay changes carry `bank.internal/change-ticket: "<ID>"`; the admission webhook rejects unticketed applies (SOX). See `sox-change-control`.
