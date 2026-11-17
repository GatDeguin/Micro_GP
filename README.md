# Micro GP

Carrera web 3D de cuatro autitos en una maqueta de circuito GP. La PC muestra la carrera. Cada celular maneja un autito desde su navegador.

## Jugar en GitHub Pages

Abrí [Micro GP](https://gatdeguin.github.io/Micro_GP/) y elegí **Jugar** para salir con la última configuración, o **Preparar partida** para elegir el circuito, el auto, la librea, la cantidad de vueltas, los rivales, la dificultad y el modo nocturno. Usá las flechas o WASD para manejar y las teclas 1 a 4 para cambiar de cámara. En una pantalla táctil aparecen los controles al empezar.

**Taller 07** forma un ocho con un cruce a dos alturas y una grada frente a meta. **Gran Premio del Dique** mide 970,61 unidades, incluidos los desvíos del puerto y la depuradora. La recta del muelle desemboca en la horquilla de la grúa. La chicana de contenedores precede al puente y el descenso del vertedero lleva al túnel de retorno bajo el mismo cruce. Las zonas mojadas tienen el 82 % del agarre seco. Sus boxes y el puerto incluyen operarios con tareas sincronizadas: motor, equilibrado de ruedas, soldadura y embalaje.

**SpaceX · Centro de pruebas** mide 1.941,21 unidades: exactamente el doble del Dique, contando el recorrido tridimensional. Combina un ocho con cruces separados en altura, una espiral elevada y dos loops verticales. Las guías magnéticas mantienen los autos sobre la pista incluso invertidos; el acelerador, el freno, la dirección y la gravedad siguen actuando. La cámara acompaña la orientación del auto en los loops. La partida propone una vuelta en los dos circuitos grandes y recuerda la cantidad elegida en cada uno.

Después del segundo loop, la pista entra al patio de integración y recorre la calle de los laboratorios, entre edificios, antes de volver a meta. Conserva los 1.941,21 de recorrido y la posición de los loops y la torre. La base tiene nueve edificios de campus: recepción, laboratorio, operaciones, depósito logístico, subestación, control de acceso, aviónica, instrumentación y centro de tripulaciones. Los caminos de servicio y senderos están separados de la carrera.

Ocho vehículos de servicio modelados en Blender —camiones, camionetas y seguridad— incluyen dos que circulan por la base. Un autoelevador con conductor carga y descarga el muelle en un ciclo continuo. Hay 74 científicos, técnicos, guardias, visitantes y fotógrafos en el sistema compartido, dos técnicos que trabajan sobre piezas dentro del hangar y el conductor del autoelevador: 77 personas en total. Ventiladores, puertas correderas, cámaras de vigilancia, banderas, mangas de viento, plantas y olas aportan actividad. El público tiene miradores y pasarela; el paisaje costero completa las vistas de persecución. Las piezas repetidas se agrupan para conservar el detalle con pocas llamadas de dibujo.

El hangar de integración está abierto y equipado con un motor de cohete sobre un soporte, puente grúa móvil, bancos con herramientas, cajoneras, compresor, mangueras, escalera y carga sobre pallets. El patio del personal incluye pérgola, mesas, café, máquinas expendedoras, anuncios y bicicleta. Junto a la calle de laboratorios se ensaya un rover de seis ruedas con instrumental y un blanco de calibración. El personal circula por senderos protegidos y las instalaciones dejan libre la pista y los caminos de servicio.

Hormigón, revoque, chapa pintada, acero cepillado, madera, goma, vidrio y asfalto tienen acabados diferenciados. El circuito espacial usa un entorno de reflejos exterior filtrado una sola vez; las bases, drenajes, rejillas, paneles solares y sombras de contacto dan escala a los edificios. El informe y las capturas de esta revisión están en [referencias/spaceport/materials-workplaces-review.md](referencias/spaceport/materials-workplaces-review.md).

Al acercarte a la plataforma principal, el cohete prepara el despegue: aumenta el vapor criogénico, se retiran los brazos umbilicales, parpadean las balizas y aparecen vibración y resplandor en los seis motores. La intensidad acompaña la proximidad de los jugadores y disminuye suavemente al alejarse. El cohete permanece sujeto a la plataforma. La iluminación espacial combina sol cálido, relleno frío, dos reflectores locales y zonas de luz que siguen la pista, incluidos los loops. Detalles y verificación en [referencias/spaceport/prelaunch-review.md](referencias/spaceport/prelaunch-review.md).

En **Práctica libre**, entrá al carril interior de boxes y detenete en una plaza señalizada para cambiar de auto. Cada autito tiene su propio manejo. Completá una vuelta limpia o mejorá un tiempo de sector por al menos 0,05 s para desbloquear las dos libreas. Los parciales se guardan por circuito.

## Jugar en Windows

1. Abrí **Jugar.cmd** o entrá en **http://127.0.0.1:4173/** si el servidor ya está activo.
2. Conectá el celular a la misma red que la PC y escaneá la placa QR de abajo a la derecha. Elegí un auto libre y marcá **Listo** en el mando.
3. En la pantalla anfitriona de la PC, elegí el circuito, configurá la partida y pulsá **Confirmar salida** cuando todos estén listos.
4. Mové la palanca a los lados para girar y mantené **GAS** para acelerar. **FRENO** tiene prioridad. Una vez detenido, soltalo y presionalo de nuevo para dar marcha atrás.

Hacé clic una vez en la maqueta para habilitar los sonidos de la carrera.

Los temas de `Musica` suenan en orden y vuelven a empezar al terminar. La música baja durante la largada, la carrera y las repeticiones para dejar espacio a los motores. Se pausa al ocultar la pestaña.

Abrí **Configuración** arriba a la izquierda o con **C**. Podés ajustar el volumen general, la música, los motores y los efectos por separado, o silenciar todo. Los niveles se aplican en vivo y se guardan en ese navegador. Para cambiar la calidad gráfica, elegí un modo y pulsá **Aplicar y recargar**. El modo predeterminado **Adaptativa (60 FPS)** ajusta la resolución interna según los tiempos de cuadro y deja margen para dibujar cuatro cámaras a la vez. **Completa** usa una escala fija y **Ligera** reduce la resolución y los efectos.

Los cuatro autitos tienen caja automática de cinco marchas. La quinta aprovecha la velocidad punta de cada modelo, con el Bólido como el más rápido en recta. El tablero de la maqueta indica la marcha y el dorsal. Se oye la caída de revoluciones al subir de marcha y un golpe de gas al reducir. Cada faro ilumina su lado de la pista en la sesión nocturna y al acercarse al tramo cubierto.

El motor de cada auto combina bucles de bajas, medias y altas revoluciones, con un timbre al acelerar y otro al soltar el gas. Micro GP genera esos bucles con Web Audio. El diseño toma como referencia la [guía de audio vehicular de Wreckfest](https://www.audiokinetic.com/media/blog/LoopBasedCarEngineDesign/vehicle_audio_modding_guide_for_wreckfest-Wwise2019_2_9.pdf).

Hay cuatro plazas. Los bots pueden cubrir los lugares libres, adelantar y retomar el volante si se pierde la conexión. Tenés 15 segundos para reabrir el mando y recuperar el auto. Si reiniciás el servidor, escaneá el QR nuevo.

Al terminar aparece un podio con los tres primeros autos que llegaron, sus pilotos y sus tiempos. **Ver tiempos** abre la clasificación completa, incluidas las diferencias, la mejor vuelta y los abandonos. **Ver resumen** prepara los efectos antes de reproducir las maniobras registradas y regresa al podio al terminar. Podés cerrar la pantalla con **Volver al circuito** y abrirla de nuevo con **Ver podio**.

En la pantalla de carrera, usá **1** para la cámara general, **2** para persecución, **3** para ver a ras de pista y **4** para las cámaras fijas del circuito con seguimiento. **M** activa o desactiva la pantalla dividida. Con dos o más mandos conectados, cada jugador tiene un panel para su auto. Con tres mandos, el cuarto panel muestra el circuito completo.

En la sala o exhibición, las cuatro cámaras se alternan cada cuatro segundos. Una elección manual reinicia ese intervalo. Al comenzar una carrera o práctica se conserva la cámara elegida y se detiene el recorrido automático.

La chicana antes del puente y las curvas peraltadas permiten elegir distintas trayectorias. El asfalto de escape, la grava y el césped cambian el agarre. Los frenajes fuertes dejan goma y las protecciones absorben los golpes antes de recuperar su forma.

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
- El diseño inicial está en **Micro GP - Dossier visual.pdf** y **Micro GP - Prompt maestro.md**. El trazado y el perfil del Dique se documentan en `referencias/gran-premio-del-dique/`. La grúa, las celosías del puente, los boxes y el muelle se modelaron en Blender y se exportaron a GLB. En esa carpeta están los dos modelos editables.

La verificación en Chrome cubre partida individual, cámaras, pantalla dividida, lectura del QR y mandos con emulación móvil. Las pruebas de red también comprueban las cuatro plazas, la reconexión del mando y el relevo del anfitrión tras un corte silencioso.
