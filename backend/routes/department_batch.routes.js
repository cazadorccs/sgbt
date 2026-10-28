// backend/routes/department_batch.routes.js
// ============================================================================
// RUTAS DE ENTREGAS MASIVAS POR DEPENDENCIA Y CADENA DE APROBACIÓN (FASE 4)
// ============================================================================

const express = require('express');
const router = express.Router();
const controller = require('../controllers/department_batch.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// 1. Estadísticas y métricas de lotes institucionales
router.get('/department-batches/stats', authenticate, controller.getDepartmentBatchStats);

// 2. Directorio de dependencias con conteo de beneficiarios y estado
router.get('/department-batches/departments', authenticate, controller.listDepartmentsWithStats);
router.get('/department-batches/departments/:id/beneficiaries', authenticate, controller.getDepartmentBeneficiaries);

// 3. Gestión del Pipeline de Órdenes de Lote
router.get('/department-batches/orders', authenticate, controller.listBatchOrders);
router.post('/department-batches/orders', authenticate, controller.createBatchOrder);

// 4. Cadena de Aprobación Jerárquica:
// - Revisión RRHH (Aprobar / Rechazar)
router.post('/department-batches/orders/:id/review', authenticate, requireRole('admin', 'director', 'supervisor'), controller.reviewBatchOrder);

// - Aprobación y Despacho Físico en Almacén
router.post('/department-batches/orders/:id/dispatch', authenticate, requireRole('operator', 'supervisor', 'admin', 'director'), controller.dispatchBatchOrder);
router.post('/department-batches/dispatch-by-token', authenticate, requireRole('operator', 'supervisor', 'admin', 'director'), controller.dispatchBatchOrder);

// 5. Acta Digital Oficial de Entrega con Sello Criptográfico SHA-256
router.get('/department-batches/orders/:id/acta', authenticate, controller.getBatchOrderActa);

module.exports = router;
