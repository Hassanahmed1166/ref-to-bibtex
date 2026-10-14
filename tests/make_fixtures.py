"""Builds tests/fixtures/sample-paper.pdf and sample-paper.docx (no third-party libraries)."""
import os, zipfile

OUT = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(OUT, exist_ok=True)

BODY = [
    'A Sample Paper on Deep Learning',
    'Abstract. We discuss residual networks and general deep learning [1], [2].',
    '1. Introduction',
    'Deep networks have transformed image recognition. This paragraph is just filler text.',
]
REFS = [
    '[1] K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image',
    'recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2016, pp.',
    '770-778.',
    '[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553,',
    'pp. 436-444, 2015.',
    '[3] A. Nobody, "Quantum blockchain governance for digital transformation," Int. J. Adv.',
    'Innov. Res., 2023.',
]


def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def page_stream(lines, start_y=760, step=16):
    ops = ['BT', '/F1 11 Tf']
    y = start_y
    for ln in lines:
        ops.append(f'1 0 0 1 72 {y} Tm ({esc(ln)}) Tj')
        y -= step
    ops.append('ET')
    return '\n'.join(ops)


def build_pdf(path):
    pages = [BODY, ['References'] + REFS]
    objs = []                                   # 1-indexed
    objs.append('<< /Type /Catalog /Pages 2 0 R >>')
    kids = ' '.join(f'{4 + 2 * i} 0 R' for i in range(len(pages)))
    objs.append(f'<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>')
    objs.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')            # obj 3
    for i, lines in enumerate(pages):
        content_id = 5 + 2 * i
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>')
        stream = page_stream(lines)
        objs.append(f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream')
    out = '%PDF-1.4\n'
    offsets = []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out.encode('latin-1')))
        out += f'{n} 0 obj\n{body}\nendobj\n'
    xref = len(out.encode('latin-1'))
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'
    for o in offsets:
        out += f'{o:010d} 00000 n \n'
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'
    open(path, 'wb').write(out.encode('latin-1'))


def build_docx(path):
    def p(t):
        return f'<w:p><w:r><w:t xml:space="preserve">{t.replace("&", "&amp;").replace("<", "&lt;")}</w:t></w:r></w:p>'
    refs = [
        '[1] K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit. (CVPR), 2016, pp. 770-778.',
        '[2] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436-444, 2015.',
        '[3] A. Nobody, "Quantum blockchain governance for digital transformation," Int. J. Adv. Innov. Res., 2023.',
    ]
    paras = BODY + ['References'] + refs
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           + ''.join(p(t) for t in paras) + '</w:body></w:document>')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml', doc)


if __name__ == '__main__':
    build_pdf(os.path.join(OUT, 'sample-paper.pdf'))
    build_docx(os.path.join(OUT, 'sample-paper.docx'))
    print('fixtures written to', OUT)
