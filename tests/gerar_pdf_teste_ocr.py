"""Gera um PDF de teste: página 1 com texto normal; página 2 só IMAGEM (texto desenhado como figura) com um carimbo de texto do Projudi na margem. Uso: gerar_pdf_teste_ocr.py saida.pdf"""
import io, sys
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
saida = sys.argv[1]
img = Image.new("RGB", (1240, 700), "white"); d = ImageDraw.Draw(img)
fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 46)
for i, linha in enumerate(["COMPROVANTE DE ENDERECO", "Gabriel Henrique Silva Nogueira", "Rua dois quadra trinta e sete", "Fatura de energia vencimento junho"]): d.text((60, 60 + i * 120), linha, fill="black", font=fonte)
c = canvas.Canvas(saida, pagesize=(595, 842))
c.setFont("Helvetica", 12); c.drawString(60, 780, "Pagina um com texto normal: peticao inicial de alimentos."); c.drawString(60, 760, "O autor requer a fixacao de alimentos provisorios em favor do menor."); c.showPage()
c.drawImage(ImageReader(img), 30, 200, width=535, height=300)
c.setFont("Helvetica", 7); c.drawString(20, 830, "Processo: 5284265-91.2018.8.09.0006 Movimentacao 139 : Juntada - Peticao Arquivo 6: comprovante.pdf - Pag. 2/3"); c.save()
