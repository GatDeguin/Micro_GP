# Spaceport: base habitada

Revisión del 16 de noviembre de 2026. Extensión de escenografía del tercer circuito.
No cambia el trazado, los loops magnéticos, la distancia de carrera ni las físicas.

## Escenario integrado

- Seis edificios: acreditación, laboratorio de materiales, logística, operaciones,
  subestación y control de acceso. Fachadas con ventanas, marquesinas, puertas,
  instalaciones de cubierta, carteles y muelles de carga.
- Caminos de servicio conectados, curvas redondeadas, carriles, aparcamientos,
  pasos de peatones, senderos, barreras, luminarias y perímetros técnicos.
- Ocho vehículos modelados en Blender: tres camiones, cuatro camionetas y un
  vehículo de seguridad. Dos circulan por un carril desplazado de la raya central;
  aceleran, frenan y hacen pausas sin teletransportarse. Ruedas y balizas animadas.
- 51 personajes: científicos con tablets, técnicos con herramientas, seguridad
  con radio, visitantes con teléfonos y fotógrafos. Caminatas con pausas, gestos,
  seguimiento de autos del mismo nivel y pequeños flashes.
- Mirador con bancos, sombra, barandillas y pasarela peatonal sobre la pista.
  El público está separado de la circulación de carrera.
- Pallets, cajones, bidones, equipos de campo, plantas y dunas costeras; cielo,
  mar y llanura con transición al horizonte para las cámaras cercanas.
- Ventanas y lentes emisivas para la noche; sombras de contacto de personas y
  vehículos. El frustum solar incluye la torre y el cohete completos.

## Correcciones de la revisión

Se corrigieron el apoyo de figuras en plataformas, un técnico dentro de cajones,
operarios sobre topes de muelle, bancos y senderos enterrados en la terraza,
el último escalón de la pasarela, la orientación de los camiones de carga y la
línea de visión de los fotógrafos sobre la barandilla. El mezclado de geometrías
ahora admite las cajas redondeadas sin perder bloques de edificios.

Los modelos conservan su detalle en calidad compacta: se reduce la frecuencia
de actualización del público y las sombras dinámicas de vehículos. Las personas
usan ocho lotes; la flota, catorce incluyendo ruedas y contactos. No se añaden
luces por personaje, por ventana ni por vehículo.

## Comprobaciones

- `npm test`: 152 pruebas aprobadas, incluidas separación de edificios y caminos
  respecto de la pista, presupuesto de personajes y continuidad de caminatas.
- `npm run build` y `npm run build:pages`: TypeScript y compilación completados.
- `node referencias/spaceport/verify-service-vehicles.mjs`: GLB de 555.344 bytes,
  480 segundos de movimiento continuo, paso máximo de 0,12002 m a intervalos de
  40 ms. La prueba de diez vehículos ocupa 47.558 triángulos y 14 lotes.
- Revisión de 14 capturas del render real: general diurna/nocturna, loops,
  persecución, espiral, torre, boxes, laboratorio, logística, visitantes y acceso.
- Flujo Pages: tres circuitos, preferencias de vueltas, cuatro cámaras de sala
  cada cuatro segundos, práctica Arcade, aceleración y vuelta al menú. La prueba
  comprueba expresamente la descarga del GLB desde la ruta publicada de assets.

## Rendimiento

Chrome/ANGLE D3D11, NVIDIA GeForce RTX 3060 Ti. Tres ventanas de ocho segundos,
calidad adaptativa predeterminada; misma configuración antes y después. La vista
general y persecución renderizan a 1920×1080; cuatro cámaras nocturnas usan la
escala adaptativa de 1536×864. Son medidas del equipo probado, no una garantía
de 60 fps para cualquier teléfono o GPU.

| Vista | GPU p95 antes | GPU p95 después | CPU p95 después | FPS después |
| --- | ---: | ---: | ---: | ---: |
| General, 1080p | 5,83 ms | 7,38 ms | 4,7 ms | 60 |
| Persecución en espiral, 1080p | 5,59 ms | 6,60 ms | 4,6 ms | 60 |
| Cuatro cámaras de noche, 864p | 5,76 ms | 7,06 ms | 5,0 ms | 60 |

No hubo cuadros de más de 25 ms en estas muestras; el máximo fue 16,9 ms.
La flota, el público y el paisaje aumentan el trabajo gráfico, con margen frente
al presupuesto de 16,67 ms en el equipo medido. Datos: [campus-performance.json](campus-performance.json).

Las mediciones completas se guardan en `.local/spaceport-campus-before.log` y
`.local/spaceport-campus-after.log` del workspace. La comprobación GPU utiliza
`EXT_disjoint_timer_query_webgl2`, descartando muestras disjuntas.

Fuentes editables y generador de la flota: [vehicles.md](vehicles.md).
