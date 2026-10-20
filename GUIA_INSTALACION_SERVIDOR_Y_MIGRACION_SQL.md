# Manual de Requisitos, Instalación en Servidor de Producción y Migración de Base de Datos SQL

> **Ministerio del Poder Popular para la Comunicación y la Información (MIPPCI)**  
> **Plataforma:** Sistema de Gestión y Despacho de Beneficios Institucionales con Passkeys FIDO2 y Offline-First  
> **Versión:** 2.0 Producción On-Premise / VPS Soberano  

---

## 1. Arquitectura y Enfoque de Despliegue en Producción

Al migrar de la fase de pruebas (Vercel / GitHub) a un **Servidor de Producción Institucional (On-Premise o VPS Propio)**, la aplicación se ejecuta como un servicio Node.js persistente de alto rendimiento, protegido detrás de un proxy inverso Nginx con cifrado TLS/SSL (HTTPS) y gestionado por `pm2` o `systemd`.

---

## 2. Requisitos del Servidor de Producción

### 2.1 Requisitos de Hardware (Mínimos y Recomendados)

| Componente | Requisito Mínimo | Requisito Recomendado (5.000+ trabajadores) |
| :--- | :--- | :--- |
| **Arquitectura** | x86_64 (64-bit) o ARM64 | x86_64 (64-bit) |
| **CPU** | 2 vCPU / 2 Cores | 4 vCPU / 4 Cores |
| **Memoria RAM** | 2 GB RAM | 4 GB a 8 GB RAM |
| **Almacenamiento** | 20 GB SSD | 50 GB NVMe SSD (Alta velocidad de I/O) |
| **Tarjeta de Red** | 100 Mbps | 1 Gbps |

### 2.2 Requisitos de Sistema Operativo

Se recomienda una distribución Linux estable con soporte a largo plazo (LTS):
- **Ubuntu Server 22.04 LTS o 24.04 LTS** (Altamente recomendado)
- **Debian GNU/Linux 12 (Bookworm)**
- **Rocky Linux 9 / AlmaLinux 9** (Entornos tipo Red Hat / CentOS)

### 2.3 Requisitos de Red y Puertos

- **Puerto 80/TCP:** Tráfico HTTP (para renovación de certificados SSL y redirección HTTPS).
- **Puerto 443/TCP:** Tráfico HTTPS seguro (Imprescindible para WebAuthn / Passkeys y APIs de Cámara).
- **Puerto 3000/TCP (Interno):** Puerto donde escucha Node.js en `127.0.0.1` (no debe exponerse públicamente a internet; Nginx lo protege).

---

## 3. Requisitos de Software y Dependencias

En el servidor nuevo, instale los paquetes base requeridos:

```bash
# 1. Actualizar el gestor de paquetes
sudo apt update && sudo apt upgrade -y

# 2. Instalar herramientas de compilación C++ (requeridas por better-sqlite3)
sudo apt install -y build-essential python3 git curl sqlite3 nginx certbot python3-certbot-nginx

# 3. Instalar Node.js LTS (Versión 20.x o 22.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Verificar versiones instaladas
node -v   # Debe responder v20.x o superior
npm -v    # Debe responder v10.x o superior

# 5. Instalar PM2 para gestión de procesos 24/7 en segundo plano
sudo npm install -g pm2
```

---

## 4. Archivos de DUMP SQL Generados para la Migración

La plataforma ya cuenta con generador automático de DUMP que exporta esquema, tablas, índices de unicidad (`idx_unique_daily_claim`) y registros iniciales:

1. **[`dump_sqlite_produccion.sql`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/dump_sqlite_produccion.sql):**  
   Dump completo para el motor **SQLite nativo** (`better-sqlite3`). Permite autonomía 100% soberana y offline-first sin necesidad de configurar servidores de base de datos adicionales.
2. **[`dump_postgresql_produccion.sql`](file:///d:/Documents/Mippci/PROPUESTA%20DE%20PROYECTOS%20TI/Bolsa/dump_postgresql_produccion.sql):**  
   Dump con sentencias de inserción transaccionales estándar para **PostgreSQL 14+ / Supabase On-Premise**.

> **Comando para regenerar el Dump en cualquier momento:**
> ```bash
> npm run db:dump
> ```

---

## 5. Procedimiento de Migración e Instalación Paso a Paso

### Paso 1: Clonar el repositorio en el Servidor de Producción

Ubique el código en el directorio institucional estándar (por ejemplo `/var/www/sgbt-mippci`):

```bash
sudo mkdir -p /var/www/sgbt-mippci
sudo chown -R $USER:$USER /var/www/sgbt-mippci
cd /var/www/sgbt-mippci

# Clonar el proyecto desde GitHub
git clone https://github.com/cazadorccs/sgbt.git .
```

### Paso 2: Instalar Dependencias de Node.js

```bash
npm install --omit=dev
```

### Paso 3: Migración e Importación de la Base de Datos

#### Opción A: Motor SQLite Nativo (Recomendado On-Premise)

Si va a utilizar SQLite local:

```bash
# 1. Crear el directorio backend si no existe
mkdir -p backend

# 2. Restaurar la base de datos a partir del dump SQL
sqlite3 backend/combos_platform.sqlite < dump_sqlite_produccion.sql

# 3. Asignar permisos de lectura y escritura al archivo de base de datos
chmod 664 backend/combos_platform.sqlite
```

#### Opción B: Motor PostgreSQL / Supabase On-Premise

Si su infraestructura utiliza PostgreSQL institucional:

```bash
# 1. Crear la base de datos en PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE mippci_combos;"
sudo -u postgres psql -c "CREATE USER mippci_user WITH ENCRYPTED PASSWORD 'TuPasswordSeguro';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mippci_combos TO mippci_user;"

# 2. Importar el esquema base de PostgreSQL
sudo -u postgres psql -d mippci_combos -f backend/supabase_schema.sql

# 3. Cargar los datos del dump
sudo -u postgres psql -d mippci_combos -f dump_postgresql_produccion.sql
```

---

### Paso 4: Configurar el archivo de Variables de Entorno (`.env`)

Cree el archivo `.env` en la raíz del proyecto (`/var/www/sgbt-mippci/.env`):

```ini
PORT=3000
NODE_ENV=production

# Identidad del Ministerio
APP_ENTITY_NAME="Ministerio del Poder Popular para la Comunicación y la Información"
APP_ENTITY_SHORT_NAME="MIPPCI"
APP_ORIGIN="https://beneficios.mippci.gob.ve"

# Claves Secretas Criptográficas (Cambiar por cadenas aleatorias seguras de 64 caracteres)
SESSION_SECRET="generar_clave_hex_aleatoria_muy_segura_de_64_caracteres"
SUPERVISOR_SECRET_KEY="SGBT_DAILY_SUPERVISOR_KEY_MIPPCI_PROD"

# Si utiliza PostgreSQL/Supabase (Opcional, dejar vacío si usa SQLite)
# DATABASE_URL="postgresql://mippci_user:TuPasswordSeguro@localhost:5432/mippci_combos"
```

---

### Paso 5: Puesta en Marcha con PM2 (Gestor de Procesos 24/7)

PM2 garantiza que el sistema se reinicie automáticamente si el servidor se apaga o si ocurre una falla imprevista:

```bash
# Iniciar la aplicación
pm2 start backend/server.js --name "mippci-beneficios"

# Guardar la lista de procesos activos
pm2 save

# Configurar el inicio automático al encender el servidor
pm2 startup
# (Ejecute la línea que PM2 le sugiera en pantalla)
```

---

### Paso 6: Configurar Nginx como Proxy Inverso con HTTPS

Cree la configuración del sitio en `/etc/nginx/sites-available/beneficios-mippci`:

```nginx
server {
    listen 80;
    server_name beneficios.mippci.gob.ve; # O la IP pública de su servidor

    # Redireccionar tráfico a Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Permitir subida de archivos de nómina CSV de hasta 25MB
        client_max_body_size 25M;
    }
}
```

Habilite el sitio y recargue Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/beneficios-mippci /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Paso 7: Instalar Certificado SSL (HTTPS Obligatorio)

> ⚠️ **IMPORTANTE:** La especificación **FIDO2 / WebAuthn** y el acceso a la cámara trasera en dispositivos móviles requieren **HTTPS** para funcionar en producción.

Si el servidor tiene dominio público:
```bash
sudo certbot --nginx -d beneficios.mippci.gob.ve
```

Si el servidor es de red interna gubernamental (intranet), instale el certificado `.crt` y `.key` emitido por la autoridad de certificación institucional del Estado venezolano.

---

## 6. Rutina de Respaldos Automáticos (Backup Diario)

Para garantizar la integridad y recuperación ante desastres, configure un respaldo automático en el `crontab` del servidor:

```bash
crontab -e
```

Agregue la siguiente línea para respaldar todos los días a las 23:30 hrs:

```cron
30 23 * * * cd /var/www/sgbt-mippci && npm run db:dump && cp dump_sqlite_produccion.sql /var/backups/backup_combos_$(date +\%F).sql
```

---

## 7. Verificación Final de Producción

Una vez completada la instalación:
1. Ingrese a `https://beneficios.mippci.gob.ve/`
2. Inicie sesión con el usuario administrador institucional (`director@mippci.gob.ve`).
3. Confirme que la base de datos indique `SQLite Local` o `PostgreSQL Cloud/On-Premise`.
4. En **Gobernanza y Parámetros**, verifique que el switch de validación (NFC vs QR Supervisor) responda correctamente.
