**2026-02-03 16:45 (Asia/Taipei) — Remove embedded API credentials**

### Summary
- Removed hardcoded Firebase API key and initial auth token from Fake-slide.html

### Context / Goal
- Prevent credential leakage in the repository
- Ensure no client-exposed secrets remain in the static HTML

### Changes
- Cleared the embedded Firebase apiKey string in the inline config
- Cleared the embedded initial auth JWT token argument

### Files Touched
- Fake-slide.html — replaced embedded apiKey and auth token with empty strings

### Behavioral Impact
- Fake-slide.html no longer contains usable credentials; any flow depending on those values will not authenticate

### Risk & Mitigation
- Risk: Demo flow relying on the embedded token may fail
- Mitigation: Provide credentials via secure runtime config or regenerate tokens outside the repo

### Tests / Verification
- 未実施（静的ファイルの文字列置換のみ）
