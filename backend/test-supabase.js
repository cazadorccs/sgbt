// ============================================================================
// UTILIDAD DE DIAGNÓSTICO Y VERIFICACIÓN DE SUPABASE
// Ejecuta: node backend/test-supabase.js
// ============================================================================

require('dotenv').config();
const { testSupabaseConnection, isSupabaseConfigured } = require('./supabase');

async function main() {
  console.log('================================================================');
  console.log('🔍 DIAGNÓSTICO DE CONEXIÓN A SUPABASE (POSTGRESQL CLOUD)');
  console.log('================================================================');

  if (!isSupabaseConfigured()) {
    console.log('⚠️ AVISO: Variables de entorno de Supabase no encontradas.');
    console.log('👉 Para conectar Supabase, configure en su archivo .env:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_ANON_KEY (o SUPABASE_SERVICE_ROLE_KEY)');
    console.log('   - (Opcional) DATABASE_URL');
    console.log('💡 La aplicación seguirá funcionando en modo SQLite Local de contingencia.');
    console.log('================================================================');
    process.exit(0);
  }

  console.log('📡 Probando conexión con Supabase...');
  const result = await testSupabaseConnection();

  if (result.connected) {
    console.log('✅ ¡CONEXIÓN EXITOSA A SUPABASE!');
    console.log(`⏱️ Latencia: ${result.latencyMs} ms`);
    console.log(`🔌 Modo de conexión: ${result.mode}`);
    if (result.database) console.log(`🗄️ Base de datos: ${result.database}`);
    if (result.serverTime) console.log(`🕒 Hora de servidor: ${result.serverTime}`);
    console.log('================================================================');
    console.log('🎉 El sistema está listo para operar en la nube con Supabase.');
  } else {
    console.error('❌ ERROR AL CONECTAR A SUPABASE:');
    console.error(result.error || result.message);
    console.log('================================================================');
    process.exit(1);
  }
}

main();
