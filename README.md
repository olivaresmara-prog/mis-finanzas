# 💶 Mis Finanzas

App web personal (PWA) para llevar el control de tus cuentas, ahorros, depósitos, inversiones y gastos. Se instala en el móvil como una app y se sincroniza con el ordenador.

## Qué hace

- **Cuentas** de varios tipos: corriente, ahorro, depósito, inversión, cartera automatizada (robo-advisor), plan de pensiones y efectivo. Cada una se marca como *disponible* o *inmovilizada*.
- **Movimientos**: gasto, ingreso, traspaso entre cuentas, rendimiento (intereses) y actualizar saldo/valor.
- **Rentabilidad de inversiones**: actualizas el valor de vez en cuando y la app calcula la ganancia (valor − capital aportado).
- **Robo-advisors**: entidad, perfil de riesgo, comisión anual (en % y en € al año) y reparto renta variable / renta fija.
- **Planes de pensiones**: individual o de empleo, con lo aportado en el año frente al límite deducible (1.500 € individual, hasta 10.000 € con plan de empresa) y aviso de octubre a diciembre si te queda margen.
- **Rentabilidad anual (TIR)** por cuenta y global, que tiene en cuenta cuándo hiciste cada aportación, y gráfico de valor frente a capital aportado. Aviso si llevas más de 30 días sin actualizar el valor de una inversión.
- **Depósitos**: TAE, vencimiento, aviso 30 días antes, intereses estimados y, al vencer, renovar o traspasar.
- **Fijos y automáticos**: nómina, recibos y aportaciones periódicas. Cuando toca, aparecen en Inicio para confirmarlos con un toque.
- **Resumen mensual**: ingresos, gastos fijos/extra, tasa de ahorro, gastos por categoría y evolución del patrimonio.
- **Copia de seguridad** en JSON y exportación de movimientos a CSV (para Excel).
- Funciona **sin conexión**.

---

## Instalación (unos 15 minutos, una sola vez)

### 1. Subir la app a GitHub Pages

1. En GitHub crea un repositorio nuevo, por ejemplo `mis-finanzas`. Puede ser **público** (tus datos no se guardan en el repositorio, solo el código). GitHub Pages en repos privados requiere un plan de pago.
2. Sube todos los archivos de esta carpeta: *Add file → Upload files*, arrástralos y pulsa *Commit*.
3. Ve a *Settings → Pages*. En *Branch* elige `main` y la carpeta `/ (root)`, y pulsa *Save*.
4. En 1–2 minutos tendrás la app en `https://TU-USUARIO.github.io/mis-finanzas/`.

En este punto ya funciona en **modo local** (los datos solo se guardan en ese navegador).

### 2. Activar la sincronización con Firebase (gratis)

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google y pulsa **Crear proyecto** (p. ej. `mis-finanzas`). Puedes desactivar Google Analytics.
2. **Authentication**: *Compilación → Authentication → Comenzar → Correo electrónico/contraseña*. Actívalo y guarda.
   - En *Settings → Dominios autorizados*, añade `TU-USUARIO.github.io`.
3. **Firestore**: *Compilación → Firestore Database → Crear base de datos*. Elige ubicación `eur3 (europe-west)` y modo **producción**.
   - En la pestaña **Reglas**, borra lo que haya, pega el contenido del archivo `firestore.rules` y pulsa **Publicar**. Esto garantiza que solo tú puedes leer tus datos.
4. **Registrar la app web**: en *Configuración del proyecto (⚙️) → Tus apps*, pulsa el icono `</>`, ponle un nombre y regístrala. Copia los valores de `firebaseConfig`.
5. En GitHub, edita `firebase-config.js` (icono del lápiz), pega tus valores y haz *Commit*.
6. Abre la app y pulsa **Crear cuenta** con tu email y una contraseña. Usa la misma en el móvil y en el ordenador.
7. *(Opcional, recomendado)* Cuando ya tengas tu usuario creado, puedes impedir que otros se registren: en *Authentication → Settings → Acciones del usuario*, desmarca **Habilitar creación**.

> Los valores de `firebaseConfig` no son secretos: identifican tu proyecto, pero las **reglas de Firestore** impiden que nadie más lea o escriba tus datos.

### 3. Instalarla en el móvil

- **Android (Chrome)**: abre la web, menú ⋮ → **Instalar aplicación** (o *Añadir a pantalla de inicio*).
- **iPhone (Safari)**: abre la web, botón Compartir → **Añadir a pantalla de inicio**.

---

## Primeros pasos recomendados

1. Crea tus cuentas con el **saldo que tienen hoy**. En las de inversión indica también cuánto dinero has aportado en total, para calcular la rentabilidad.
2. En **Más → Fijos y automáticos** añade la nómina, el alquiler, los recibos y las aportaciones periódicas.
3. Día a día, usa el botón **+** para los gastos extra.
4. Una vez al mes, **actualiza el valor** de tus inversiones y, si algún saldo no cuadra con el banco, usa **Ajustar saldo**.

## Actualizar la app

Cuando cambies archivos, sube también un número en la línea `const CACHE = 'mis-finanzas-v1'` de `sw.js` (v2, v3…) para que los móviles descarguen la nueva versión.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css` | Estructura y diseño |
| `app.js` | Pantallas, cálculos y formularios |
| `store.js` | Guardado de datos (local o Firebase) |
| `firebase-config.js` | Tus claves de Firebase |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación como app y uso sin conexión |
