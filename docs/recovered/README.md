# 4EIGN HQ — desde cero

Aplicación nueva e independiente: **Next.js + TypeScript + Supabase**, preparada para desplegar en un host compatible con Next.js, incluido Vercel. No modifica un HQ anterior ni DBH.

## Estado real

- **Raíz `/`: acceso privado de producción configurado con la URL y clave publicable del proyecto autorizado.** Sin sesión y membresía confiable no muestra contenido. El owner de Auth y su membresía todavía requieren provisión/verificación administrativa.
- **Demo independiente `/demo/`:** datos ficticios, persistencia únicamente en `localStorage` de este navegador. La demo no tiene autenticación real ni es una frontera de seguridad. No introducir contenido confidencial.
- **Adaptador de producción implementado:** Supabase Auth, Postgres con RLS, membresías confiables y Storage privado. Configuración pública incluida; los flujos autenticados reales y Storage HTTP todavía no están verificados.
- Sin publicación automática a Instagram, IA, notificaciones, analítica ni invitaciones.
- Zona horaria de planificación: `America/Puerto_Rico` (UTC−04:00). Fechas almacenadas como instantes UTC.

## Ejecutar en tu computadora o entorno Codex

Necesitas Node.js 20.9 o posterior (probado aquí con Node 24). Desde esta carpeta:

```bash
npm ci
npm run dev
```

Abre la URL que muestre Next.js: `/` muestra login privado; `/demo/` permite probar ejemplos sin servicios. No copies una dirección `localhost` de otro equipo como si fuera una publicación accesible.

Para revisar todo:

```bash
npm run check
```

`check` ejecuta ESLint, TypeScript, pruebas de Node y compilación de producción. Las pruebas de código no reemplazan las pruebas de RLS sobre Postgres: ver `supabase/` y `docs/`.

## Qué puedes probar en la demo

1. Abrir `/demo/` y editar la visión semanal como owner.
2. Crear una publicación: cuenta, título, caption, fecha/hora de Puerto Rico, responsable y estado.
3. Adjuntar JPG, PNG, WebP, MP4 o WebM (máximo **2 MB en demo** para no agotar almacenamiento del navegador), o un enlace HTTPS de video.
4. Guardar, volver a abrir, comentar y aprobar como owner.
5. Cambiar al rol colaborador: no puede editar la visión ni aprobar/publicar ni editar/eliminar contenido ya aprobado o publicado.
6. Revisar calendario, contenido y composición del feed de tres columnas.
7. Recargar: se mantienen los cambios de ese navegador. Restablecer demo vuelve a los ejemplos.

Las cuentas y personas de ejemplo son ficticias. Los gráficos de portada son composiciones CSS, no assets finales del usuario.

## Conectar producción de forma segura

Estos pasos requieren una persona autorizada. El proyecto y la migración ya se prepararon por el flujo autorizado; consulta `evidence/QA.md`. No se ha creado una identidad Auth ni se ha asignado automáticamente el owner desde el frontend.

1. Crear/seleccionar el proyecto Supabase autorizado y aplicar la migración revisada de `supabase/migrations/`.
2. Ejecutar la suite SQL de autorización sobre un entorno de prueba. Revisar los advisors de seguridad. Verificar expresamente denegación para anónimo, cuenta sin membresía, colaborador y otro workspace.
3. Configurar Supabase Auth. Desactivar registro público y acceso anónimo para esta aplicación privada. No existe pantalla de registro en HQ, pero eso por sí solo no desactiva endpoints de Auth.
4. Crear/verificar los usuarios autorizados por un flujo administrativo aprobado; insertar un workspace, sus membresías y cuentas desde administración confiable. La aplicación no permite que un usuario se asigne un rol.
5. La URL y **clave publicable** autorizadas están en `lib/public-config.ts`; no son secretos y RLS protege los datos. No hace falta ninguna variable de entorno para este proyecto. `.env.example` documenta overrides opcionales para otro proyecto: deben cambiarse **ambos**, nunca mezclar URL y clave de proyectos distintos. Nunca introducir `service_role`, `sb_secret_...`, contraseñas ni tokens administrativos en el frontend.
6. La raíz siempre usa el adaptador de producción y falla cerrado. **Nunca cae en la demo.** `/demo/` instancia exclusivamente el repositorio ficticio y no concede acceso al backend.
7. Iniciar sesión con usuarios autorizados y verificar upload, comentarios, cambios de estado y lectura tras recargar. Los archivos se suben al bucket privado `hq-media` (máximo 25 MB); las URLs firmadas duran 10 minutos y se renuevan al refrescar datos.
8. Elegir hosting y plan elegible para el uso real. `npm run build` genera `out/` estático; el ZIP de despliegue contiene esos archivos en la raíz. Ver `docs/DEPLOY.md` para Netlify. No asumir que un plan personal gratuito permite uso comercial. Con autorización, importar este proyecto (configuración publicable ya incluida), compilar y configurar las URLs de Auth.
9. Repetir las pruebas en la URL real antes de introducir contenido del negocio.

## Arquitectura

- `app/`: shell Next.js y metadatos; no incluye datos privados SSR.
- `components/hq.tsx`: interfaz responsive, formularios y vistas.
- `lib/types.ts`: contrato independiente del almacenamiento.
- `lib/demo-repository.ts` + `fixtures.ts`: demo explícita, no conectada a producción.
- `lib/supabase-repository.ts`: Auth verificado con `getUser`, membresía desde base, lectura/escritura mediante RLS, uploads privados sin sobreescritura.
- `lib/use-hq.ts`: selección explícita de producción o demo, estados de sesión, errores y guardado.
- `lib/public-config.ts`: URL y clave publicable autorizadas, nunca credenciales privilegiadas.
- `netlify.toml` y `public/_headers`: configuración de exportación/hosting estático.
- `lib/dates.ts`: conversiones de fechas consistentes en Puerto Rico.
- `lib/validation.ts`: validación de UX, **no sustituto de políticas SQL**.
- `supabase/`: migración y pruebas negativas de acceso.
- `tests/`: pruebas ejecutables del código.
- `evidence/`: evidencia de validación en el entorno cloud.

## Límites conocidos

- Esta versión admite una membresía/workspace por usuario en la instalación. Varias membresías generan un estado explícito sin escoger silenciosamente una.
- No hay gestión de usuarios, roles ni cuentas sociales dentro del producto. Se provisionan por administración confiable.
- URLs externas de video son enlaces manuales, no embeds ni integraciones. No se descargan automáticamente.
- No hay publicación a redes: «Publicado» es un estado manual administrado por owner.
- Los uploads son inmutables; un archivo abandonado al cancelar un formulario puede quedar sin referencia y requiere limpieza administrativa. No se sobreescribe contenido aprobado.
- No hay edición colaborativa en tiempo real ni resolución automática de conflictos. Se refrescan datos después de guardar, al recuperar foco y periódicamente en producción.
- El texto y los archivos de la demo no se migran automáticamente a producción.

## Fuentes técnicas consultadas

- [Next.js: instalación](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase: getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase: URLs firmadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Supabase: seguridad de APIs](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: changelog](https://supabase.com/changelog)

Las tipografías DM Sans e Instrument Serif se solicitan a Google Fonts con fallbacks locales; no se cargan herramientas de analítica.
