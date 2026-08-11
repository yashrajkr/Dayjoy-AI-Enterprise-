{{/*
Common labels shared across all Dayjoy AI Helm resources.
*/}}
{{- define "dayjoyai.labels" -}}
app.kubernetes.io/name: dayjoyai
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: dayjoyai-platform
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- with .Chart.AppVersion }}
app.kubernetes.io/version: {{ . | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels for Dayjoy AI resources.
*/}}
{{- define "dayjoyai.selectorLabels" -}}
app.kubernetes.io/name: dayjoyai
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
