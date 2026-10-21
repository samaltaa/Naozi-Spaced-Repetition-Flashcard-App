from __future__ import annotations

from curator.sources.fetch import extract_text, strip_end_matter

# End matter

PAGE = """<html><body><div class="mw-parser-output">
<p>Las matemáticas estudian números<sup class="reference"><a href="#cite-1">[1]</a></sup> y formas.</p>
<h2>Enlaces externos</h2>
<ul><li><a class="external text" href="https://example.com">Archivo</a> (archivado)</li></ul>
<div class="reflist"><ol class="references"><li>Consultado el 5 de mayo de 2020.</li></ol></div>
<div class="navbox">Portal de matemáticas</div>
</div></body></html>"""

def test_references_and_links_are_removed() -> None:
    cleaned = strip_end_matter(PAGE)
    assert "estudian números y formas" in cleaned
    for gone in ("[1]", "Archivo", "Consultado", "Portal"):
        assert gone not in cleaned

def test_unparseable_pages_pass_through() -> None:
    assert strip_end_matter("") == ""

# Joiners

def test_zero_width_joiners_survive_extraction() -> None:
    sentence = "این نوشیدنی پس از آب، پرمصرف‌ترین نوشیدنی جهان است و به‌دست می‌آید."
    page = f"<html><body><article><h1>چای</h1><p>{sentence}</p><p>{sentence}</p></article></body></html>"
    text = extract_text(page)
    assert text is not None
    assert "می‌آید" in text
    assert "QZWNJQ" not in text
