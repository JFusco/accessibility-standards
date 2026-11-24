---
topics: [project-maintenance]
issue: 'https://github.com/jfusco/accessibility-standards/issues/14'
issues: ['https://github.com/jfusco/accessibility-standards/issues/14']
---
# Normalize APG title markup

The launch checkpoint isolated a hash difference to a code tag in the HTML title of APG Hiding Semantics. Python 3.14 retained the tag where the baseline parser stripped it. The scanner now retains the title words and preserves literal code examples in the body. The scan workflow exercises both title representations before it fetches sources. [No-impact evidence](https://github.com/JFusco/accessibility-standards/issues/6#issuecomment-7118197755) · [Scanner repair](https://github.com/JFusco/accessibility-standards/issues/14)
