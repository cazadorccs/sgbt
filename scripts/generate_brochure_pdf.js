const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlPath = path.resolve(__dirname, '..', 'public', 'brochure_pdf_source.html');
const outPublic = path.resolve(__dirname, '..', 'public', 'SGBT_Brochure_Institucional.pdf');
const outDocs = path.resolve(__dirname, '..', 'docs', 'SGBT_Brochure_Institucional.pdf');

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

console.log('Generando PDF con Microsoft Edge Headless...');
console.log('Fuente HTML:', fileUrl);
console.log('Destino Public:', outPublic);

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${outPublic}`,
  fileUrl
];

try {
  execFileSync(edgePath, args, { stdio: 'inherit' });
  const stats = fs.statSync(outPublic);
  console.log(`PDF generado con éxito: ${stats.size} bytes`);
  
  // Copiar también a docs/
  fs.copyFileSync(outPublic, outDocs);
  console.log(`Copia sincronizada en: ${outDocs}`);

  const publicBrochurePdf = path.resolve(__dirname, '..', 'public', 'brochure.pdf');
  const docsBrochurePdf = path.resolve(__dirname, '..', 'docs', 'brochure.pdf');
  fs.copyFileSync(outPublic, publicBrochurePdf);
  fs.copyFileSync(outPublic, docsBrochurePdf);
  console.log(`Copias brochure.pdf sincronizadas.`);
} catch (err) {
  console.error('Error generando PDF:', err);
  process.exit(1);
}

