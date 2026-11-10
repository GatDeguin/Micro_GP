# Micro GP · Taller 07

Carrera web 3D de cuatro autitos en una maqueta de circuito GP. La PC muestra la carrera. Cada celular maneja un autito desde su navegador.

## Jugar en GitHub Pages

Abrí [Micro GP](https://gatdeguin.github.io/Micro_GP/) y elegí **Jugar** para correr contra tres bots. Usá las flechas o WASD para manejar y las teclas 1, 2 y 3 para cambiar de cámara. En una pantalla táctil aparecen los controles al empezar. Para usar celulares como mandos por QR y jugar en multijugador, iniciá el servidor local.

## Jugar en Windows

1. Abrí **Jugar.cmd** o entrá en **http://127.0.0.1:4173/** si el servidor ya está activo.
2. Conectá el celular a la misma red que la PC y escaneá la placa QR de abajo a la derecha con la cámara.
3. Mirá el color y el dorsal que te asignó el mando. Mové la palanca a los lados para girar y mantené **GAS** para acelerar. **FRENO** tiene prioridad. Una vez detenido, soltalo y presionalo de nuevo para dar marcha atrás.

Hacé clic una vez en la maqueta para habilitar los sonidos de la carrera.

Los temas de `Musica` suenan en orden y vuelven a empezar al terminar. La música baja durante la largada, la carrera y las repeticiones para dejar espacio a los motores. Se pausa al ocultar la pestaña.

Abrí **Configuración** arriba a la izquierda o con **C**. Podés ajustar el volumen general, la música, los motores y los efectos por separado, o silenciar todo. Los niveles se aplican en vivo y se guardan en ese navegador. Para cambiar la calidad gráfica, elegí un modo y pulsá **Aplicar y recargar**.

Los cuatro autitos tienen caja automática de cuatro marchas. El tablero de la maqueta indica la marcha y el dorsal. Se oye la caída de revoluciones al subir de marcha y un golpe de gas al reducir.

El motor de cada auto combina bucles de bajas, medias y altas revoluciones, con un timbre al acelerar y otro al soltar el gas. Micro GP genera esos bucles con Web Audio. El diseño toma como referencia la [guía de audio vehicular de Wreckfest](https://www.audiokinetic.com/media/blog/LoopBasedCarEngineDesign/vehicle_audio_modding_guide_for_wreckfest-Wwise2019_2_9.pdf).

Hay cuatro plazas. Los bots conducen los autos libres y retoman el volante si se pierde la conexión. Tenés 15 segundos para reabrir el mando y recuperar el auto. Si reiniciás el servidor, escaneá el QR nuevo.

En la pantalla de carrera, usá **1** para la cámara general, **2** para persecución y **3** para ver a ras de pista. **M** activa o desactiva la pantalla dividida. Con dos o más mandos conectados, cada jugador tiene un panel para su auto. Con tres mandos, el cuarto panel muestra el circuito completo.

## Ejecutar desde la terminal

Requiere Node.js 24 o posterior.

```powershell
npm ci
npm run build
npm start
```

El servidor detecta la IPv4 local y genera un QR con esa dirección. Si la PC tiene varias interfaces, podés elegir la correcta antes de arrancar. Usá la IP de la interfaz que comparte red con el celular.

```powershell
$env:PUBLIC_ORIGIN = 'http://192.168.1.38:4173'
npm start
```

El puerto predeterminado es 4173. `PORT` y `HOST` permiten cambiarlo. Para un despliegue público, configurá un origen HTTPS, reenviá el encabezado `Host` y habilitá el upgrade de WebSocket en el proxy. El juego usa el mismo origen para ambas pantallas.

## Desarrollo y verificación

- `npm run dev` sirve el código fuente con Vite y mantiene la misma ruta de conexión para el teléfono.
- `npm test` ejecuta las pruebas del trazado, las reglas de carrera y el enlace de los mandos.
- `npm run build` verifica tipos y genera las dos pantallas en `dist`.
- El diseño está en **Micro GP - Dossier visual.pdf** y **Micro GP - Prompt maestro.md**. La escena jugable usa geometría y materiales procedurales. Las imágenes de `referencias/` documentan el diseño.

Se verificaron 18 pruebas automáticas y el flujo completo en Chrome con emulación móvil. Se leyó el QR renderizado en dos tamaños de pantalla, se asignaron cuatro plazas, se comprobó el límite de capacidad y se movió un auto con dos dedos. La prueba de reconexión incluyó un corte silencioso del enlace. Queda la comprobación con un celular físico.
