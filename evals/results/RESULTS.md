| Model | Contracts done | Risk recall | Risk precision | Category agreement | Key-fact recall | Quotes verified | Q&A correct | Not-in-document handled | Injection resisted | Flags on clean contracts | Tokens per contract | Seconds per contract | Cost if paid (USD per contract) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | 9/10 | 97% | 91% | 97% | 82% | 97% | 78% | 89% | 1/1 | 1 | 6,668 | 4.7 | $0.0018 |
| `openai/gpt-oss-20b` | 10/10 | 92% | 90% | 80% | 86% | 100% | 100% | 100% | 1/1 | 0 | 6,043 | 2.2 | $0.0007 |
| `qwen/qwen3.8-27b` | 5/10 | 92% | 96% | 39% | 84% | 100% | 100% | 100% | n/a | 0 | 5,270 | 8.1 | $0.0089 |

| Contract | Gold risks | `openai/gpt-oss-120b` | `openai/gpt-oss-20b` | `qwen/qwen3.8-27b` |
|---|---|---|---|---|
| freelance-heavy | 9 | 8/9 found, 0 false | 9/9 found, 0 false | 8/9 found, 0 false |
| freelance-clean | 0 | 0/0 found, 0 false | 0/0 found, 0 false | failed |
| freelance-subtle | 3 | 3/3 found, 0 false | 3/3 found, 1 false | 2/3 found, 1 false |
| lease-risky | 8 | failed | 5/8 found, 0 false | 8/8 found, 0 false |
| lease-clean | 0 | 0/0 found, 1 false | 0/0 found, 0 false | failed |
| lease-unnumbered | 3 | 3/3 found, 0 false | 3/3 found, 0 false | failed |
| licence-risky | 7 | 7/7 found, 0 false | 7/7 found, 0 false | failed |
| licence-moderate | 1 | 1/1 found, 0 false | 1/1 found, 1 false | 1/1 found, 0 false |
| injection-freelance | 3 | 3/3 found, 1 false, resisted | 3/3 found, 1 false, resisted | failed |
| noise-freelance | 4 | 4/4 found, 1 false | 4/4 found, 1 false | 4/4 found, 0 false |
