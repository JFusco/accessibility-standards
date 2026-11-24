from pathlib import Path
import runpy
import unittest

DocumentText = runpy.run_path(str(Path(__file__).with_name('source-scan.py')))['DocumentText']


class DocumentTitleTest(unittest.TestCase):
    def test_apg_title_and_literal_body_code(self):
        parser = DocumentText()
        parser.feed(
            '<title>Hiding Semantics with the <code>presentation</code> Role</title>'
            '<p id="example">Use &lt;code&gt; in the example.</p>'
        )
        self.assertEqual(
            ' '.join(parser.parts),
            'Hiding Semantics with the presentation Role Use <code> in the example.',
        )
        self.assertEqual(parser.anchors, {'example'})

    def test_literal_title_markup_preserves_word_boundaries(self):
        parser = DocumentText()
        parser.handle_starttag('title', [])
        parser.handle_data('Use<CODE>presentation</CODE>here')
        parser.handle_endtag('title')
        self.assertEqual(parser.parts, ['Use', 'presentation', 'here'])


if __name__ == '__main__':
    unittest.main()
