# Reglas del Proyecto SGBT (MIPPCI)

## Sincronización Automática con GitHub y Despliegue en Vercel

**Instrucción Obligatoria Permanente:**
Cada vez que se resuelva un problema, corrija un bug, aplique un ajuste o se agregue/modifique una funcionalidad en el proyecto:

1. **Verificación de Calidad y Sintaxis:**
   - Validar que los archivos modificados no tengan errores de sintaxis (`node -c <archivo>`).
   - Ejecutar la suite de pruebas (`npm test`) para garantizar que todas las suites pasen al 100%.

2. **Commit Semántico Automático:**
   - Preparar los archivos con `git add`.
   - Generar un commit descriptivo y conciso siguiendo el estándar convencional (ej: `fix(...)`, `feat(...)`, `docs(...)`).

3. **Push Automático a GitHub:**
   - Ejecutar inmediatamente `git push origin main` hacia el repositorio remoto `https://github.com/cazadorccs/sgbt.git`.
   - Esto desencadena el redespliegue automático y continuo en producción en Vercel (`https://sgbt-bice.vercel.app/`).

4. **Confirmación al Usuario:**
   - Informar al usuario el hash del commit generado, los archivos sincronizados y el estado de la rama.
