// scripts/capture_real_screens.js
// Automatización para captura en alta resolución de pantallas reales del sistema SGBT

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'images');
const ASSETS_DIR = path.join(__dirname, '..', 'videos', 'proceso-entrega', 'assets');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function captureScreens() {
  console.log('🚀 Iniciando Chrome para capturas de pantalla de alta fidelidad...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2 // Calidad Retina 2x ultra-nítida
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  // Función auxiliar para guardar tanto en docs/images como en videos/assets
  async function saveScreenshot(filename, clipOrFull = {}) {
    const docPath = path.join(OUTPUT_DIR, filename);
    const assetPath = path.join(ASSETS_DIR, filename);
    await page.screenshot({ path: docPath, ...clipOrFull });
    fs.copyFileSync(docPath, assetPath);
    console.log(`  📸 Captura guardada: ${filename}`);
  }

  try {
    // ------------------------------------------------------------------------
    // 1. PANTALLA DE LOGIN INSTITUCIONAL (#view-login)
    // ------------------------------------------------------------------------
    console.log('\n[1/7] Capturando Pantalla de Login Institucional...');
    await page.goto('http://localhost:3000/#view-login', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1200));

    // Asegurar vista login
    await page.evaluate(() => {
      if (typeof window.setLoginMode === 'function') window.setLoginMode('beneficiary');
    });
    await new Promise(r => setTimeout(r, 600));

    await saveScreenshot('01_portal_acceso_login.png');

    // ------------------------------------------------------------------------
    // 2. CARNET DIGITAL OFICIAL DEL BENEFICIARIO (#view-worker)
    // ------------------------------------------------------------------------
    console.log('\n[2/7] Capturando Carnet Digital del Beneficiario con QR Dinámico...');
    await page.evaluate(async () => {
      // Login formal administrativo para habilitar todas las vistas y APIs
      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: '13537582', admin_secret: '0578', require_admin: true })
      });
      const loginData = await loginRes.json();
      if (loginData.user) {
        window.STATE.currentUser = loginData.user;
        window.STATE.selectedWorkerId = loginData.user.id;
      }
      if (typeof window.navigateTo === 'function') window.navigateTo('view-worker');
      if (typeof window.updateWorkerCard === 'function') await window.updateWorkerCard();

      // Habilitar visor de QR si estaba colapsado
      const qrCont = document.getElementById('workerQrContainer');
      if (qrCont) qrCont.style.display = 'flex';

      // Asegurar candado visible
      const lockCont = document.getElementById('deviceLockBadgeContainer');
      if (lockCont) lockCont.style.display = 'block';
    });
    await new Promise(r => setTimeout(r, 1500));

    await saveScreenshot('02_carnet_beneficiario_movil.png');

    // ------------------------------------------------------------------------
    // 3. MESA DE DESPACHO EN ALMACÉN (#view-distributor)
    // ------------------------------------------------------------------------
    console.log('\n[3/7] Capturando Consola de Mesa de Despacho en Almacén...');
    await page.evaluate(() => {
      if (typeof window.navigateTo === 'function') window.navigateTo('view-distributor');
    });
    await new Promise(r => setTimeout(r, 1200));

    await saveScreenshot('03_mesa_despacho_almacen.png');

    // ------------------------------------------------------------------------
    // 4. MESA DE DESPACHO CON VISOR LÁSER / HUD EN VIVO
    // ------------------------------------------------------------------------
    console.log('\n[4/7] Capturando Mesa de Despacho con HUD de Validación...');
    await page.evaluate(() => {
      const hud = document.getElementById('cameraScanHUD');
      const liveCont = document.getElementById('liveCameraContainer');
      const standby = document.getElementById('cameraStandbyBox');
      if (liveCont) liveCont.style.display = 'block';
      if (standby) standby.style.display = 'none';
      if (hud) {
        hud.style.display = 'block';
        hud.style.background = 'rgba(16, 185, 129, 0.9)';
        const title = document.getElementById('cameraScanHUDTitle');
        const sub = document.getElementById('cameraScanHUDSub');
        if (title) title.textContent = 'SAHIB ALEXANDER FRANCO (V-13.537.582)';
        if (sub) sub.textContent = '📦 Cuota: 4 Combos (3 Secos + 1 Proteína)';
      }
    });
    await new Promise(r => setTimeout(r, 800));

    await saveScreenshot('04_lector_escaner_hud.png');

    // ------------------------------------------------------------------------
    // 5. MODAL DE CONTINGENCIA ASISTIDA (SUPERVISOR)
    // ------------------------------------------------------------------------
    console.log('\n[5/7] Capturando Modal de Contingencia Asistida del Supervisor...');
    await page.evaluate(() => {
      const modal = document.getElementById('supervisorModalBackdrop');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
        const docInp = document.getElementById('supervisorContingencyDocInput');
        if (docInp) docInp.value = 'V-18.456.123';
        const nameEl = document.getElementById('modalBeneficiaryName');
        const docEl = document.getElementById('modalBeneficiaryDoc');
        const comboEl = document.getElementById('modalBeneficiaryCombo');
        const detailsBox = document.getElementById('modalWorkerDetails');
        if (detailsBox) detailsBox.style.display = 'block';
        if (nameEl) nameEl.textContent = 'CARLOS EDUARDO MENDOZA';
        if (docEl) docEl.textContent = 'V-18.456.123';
        if (comboEl) comboEl.textContent = 'Bolsa de Víveres Secos + Combo Proteico';
      }
    });
    await new Promise(r => setTimeout(r, 800));

    await saveScreenshot('05_contingencia_supervisor_modal.png');

    // Cerrar modal de supervisor
    await page.evaluate(() => {
      const modal = document.getElementById('supervisorModalBackdrop');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    });

    // ------------------------------------------------------------------------
    // 6. HISTORIAL DE RECIBOS Y COMPROBANTE OFICIAL
    // ------------------------------------------------------------------------
    console.log('\n[6/7] Capturando Historial de Recibos Digitales...');
    await page.evaluate(() => {
      const modal = document.getElementById('receiptsHistoryModalBackdrop');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.style.visibility = 'visible';
      }
    });
    await new Promise(r => setTimeout(r, 800));

    await saveScreenshot('06_recibos_digitales_modal.png');

    // Cerrar modal de recibos
    await page.evaluate(() => {
      const modal = document.getElementById('receiptsHistoryModalBackdrop');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    });

    // ------------------------------------------------------------------------
    // 7. TABLERO CENTRAL DE AUDITORÍA MINISTERIAL (#view-admin)
    // ------------------------------------------------------------------------
    console.log('\n[7/7] Capturando Tablero Central de Auditoría Ministerial...');
    await page.evaluate(() => {
      if (typeof window.navigateTo === 'function') window.navigateTo('view-admin');
    });
    await new Promise(r => setTimeout(r, 1500));

    await saveScreenshot('07_tablero_auditoria_ministerial.png');

    console.log('\n✅ Todas las pantallas del sistema fueron capturadas en alta resolución.');

  } catch (err) {
    console.error('❌ Error capturando pantallas:', err);
  } finally {
    await browser.close();
  }
}

captureScreens();
