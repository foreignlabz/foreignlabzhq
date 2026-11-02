# Publicar sin servidor Next.js

Este HQ usa únicamente páginas cliente y Supabase remoto. `output: 'export'` genera HTML/JS/CSS en `out/`. No necesita SSR, funciones, un servidor de Node permanente ni un plan de Vercel.

## Netlify manual

1. El usuario entra en su propia cuenta de Netlify y verifica que está seleccionando el plan gratuito elegible. No aceptar upgrades, trial de pago o tarjeta sin autorización.
2. `npm ci && npm run build` produce `out/` (o usar el ZIP de despliegue ya generado).
3. Para carga manual, descomprimir el ZIP de despliegue y subir **la carpeta que contiene `index.html` directamente**. No subir el ZIP de código fuente, `node_modules`, `.next` ni una carpeta padre vacía.
4. Verificar la URL HTTPS que devuelva Netlify. La raíz debe mostrar login, **no ejemplos**. `/demo/` debe mostrar una banda explícita de datos ficticios.
5. En Supabase, verificar la URL de sitio/redirect adecuada antes de usar invitaciones, recuperación o enlaces de correo. El login email/contraseña actual no depende de magic links.
6. Aplicar el bootstrap de identidad confiable de abajo y probar los flujos reales. Los límites/pausa del plan gratuito dependen del proveedor y deben revisarse antes del uso operativo.

Alternativa Git: `netlify.toml` ya declara `npm run build` y `out`. Las variables públicas no son necesarias para este proyecto porque la URL/clave publicable autorizadas están incluidas. Nunca configurar una clave secreta en frontend.

`public/_headers` aplica encabezados de seguridad en Netlify. Si se usa otro hosting, copiar su equivalente: no asumir que ese host interpreta `_headers`.

## Habilitar al owner, sin contraseñas por chat

El usuario de Supabase Dashboard no es automáticamente un usuario de Supabase Auth de esta aplicación.

1. Un administrador autorizado abre **Authentication → Users** del proyecto correcto y crea la identidad del owner verificado con un flujo seguro. El usuario introduce su contraseña directamente en la superficie de confianza; no compartirla por chat, código ni logs. Si el método elegido envía una invitación/correo, obtener autorización explícita antes de enviarlo.
2. Verificar el registro de `auth.users` y el correo correcto. **No confiar en metadata que el cliente pueda editar** y no asignar owner al primer registro arbitrario.
3. Ejecutar `supabase/bootstrap.example.sql` como administrador con el UUID confirmado (revisar y sustituir placeholders antes). Solo este flujo confiable crea el workspace, la membresía owner y las cuentas.
4. Entrar en la raíz de la URL publicada con la cuenta habilitada. Antes del bootstrap la aplicación mostrará «Acceso pendiente» aunque la contraseña sea correcta.
5. Probar una cuenta colaboradora y otra sin membresía antes de usar información real. No crear/invitar colaboradores sin autorización.

No existe registro público ni botones que puedan autoasignarse permisos dentro del HQ. La configuración de registro público/anonymous Auth del proyecto debe revisarse por administración; no se modifica mediante el código de la aplicación.

## Separación de archivos

- `4EIGN-HQ-v2-source.zip`: proyecto editable, pruebas, migración, documentación y evidencia.
- `4EIGN-HQ-v2-static-deploy.zip`: **solo `out/` compilado**, listo para subir a hosting estático.
- `/`: aplicación privada configurada, sin fallback demo.
- `/demo/`: muestra pública de datos ficticios aislada de la base real. No usarla para trabajo real; no migra datos automáticamente.

No se ha publicado una URL externa por el solo hecho de generar estos paquetes.
