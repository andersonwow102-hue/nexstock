import sys, json
sys.path.insert(0, 'tmp/pdfs/qa-deps')
import zxingcpp
from PIL import Image
from pypdf import PdfReader
audit = json.load(open('qa/patrimonio-piloto/audit.json', encoding='utf-8'))['rows'][0]
actual = sorted(r.text for r in zxingcpp.read_barcodes(Image.open('tmp/pdfs/piloto-preview.png')))
expected = sorted('https://nexstock-delta.vercel.app/patrimonio/' + r['public_id'] for r in audit['records'])
assert actual == expected, (actual, expected)
pdf = PdfReader('output/pdf/NEPTERA_PAT-202609-0001_PILOTO_REAL.pdf')
assert len(pdf.pages) == 1
text = pdf.pages[0].extract_text()
assert all(text.count(r['codigo']) == 1 for r in audit['records'])
for word in ['NEPTERA', 'PATRIMÔNIO', 'Identidade patrimonial']:
    assert text.count(word) == 5
links = sorted(a.get_object()['/A']['/URI'] for a in pdf.pages[0]['/Annots'])
assert links == expected
print('PASS: 5 QR decodificados da página renderizada; 5 links; IDs idênticos ao banco; 5 etiquetas únicas em 1 página A4.')
print('Base pública: https://nexstock-delta.vercel.app; identificadores omitidos.')
