# Recorrido por el campus y actividad de la base

## Diseño integrado

Después de la salida del segundo loop, la carrera se acerca al depósito, pasa
junto al hangar, toma la curva del patio de integración y recorre la calle entre
laboratorios antes de volver a meta. Se conservan los loops, el ocho, la espiral,
la ubicación de las instalaciones anteriores y los 1.941,21 de recorrido total.
La compensación de longitud se aplica únicamente a la curva amplia de retorno.

El giro del patio usa dos cuartos de círculo: su radio mínimo medido es 7,94,
con margen para la pista y las barreras. No hay cruces nuevos a nivel con los
caminos de servicio. Aviónica, instrumentación y tripulaciones completan el lado
oeste de la calle, con ventanas hacia la carrera y accesos por un paseo protegido.
Un pequeño mirador conecta con aviónica y permite fotografiar el paso de autos.

## Actividad y detalles

- Autoelevador con conductor, ruedas, mástil, horquillas, baliza y carga: ciclo
  continuo de 44 segundos entre muelle y playa, elevando antes de desplazarse.
- 21 equipos de ventilación con rotores y rejillas en las cubiertas.
- Puertas correderas de recepción y laboratorio con hojas, guías e indicadores.
- Cámaras de seguridad que barren el entorno y siguen autos cercanos.
- Mangas de viento y banderas articuladas, vegetación con movimiento de viento,
  juncos y crestas de olas móviles.
- 62 personajes de a pie más el operador sentado del autoelevador.
- Fachadas laterales, portón señalizado del campus, bancos, luminarias, pallets,
  señalización y conexiones peatonales.

Los sistemas nuevos de actividad usan 14 lotes instanciados y 10.744 triángulos.
Se actualizan a 30 Hz, o 12 Hz en modo compacto, sin desaparecer equipos. Los
arbustos se animan en el shader; no se recalculan sus mallas en la CPU. No se
añaden luces ni pases de render por las nuevas microanimaciones.

## Revisión y pruebas

Se verificaron los márgenes entre ruta y edificios, y entre carrera y caminos
de servicio. La revisión corrigió dunas sobre el paseo, pies de baranda fuera de
la losa, cajones enterrados en el muelle y neumáticos del autoelevador flotando.
La carga móvil mantiene apoyo continuo y no atraviesa camiones, operarios o stock.

`npm test`: 157 pruebas aprobadas. Incluyen conducción completa de los cuatro
bots en rookie, club y pro, sin reinicios ni saltos de posición; todos terminan
una vuelta. Se añadió una comprobación del radio interior de las curvas del
campus y cuatro pruebas de la actividad, sus movimientos y sus presupuestos.

`npm run build` y `npm run build:pages` completados. Capturas del render real:
[calle del campus](campus-street.png), [vista aérea](campus-street-aerial.png) y
[logística trabajando](campus-logistics-working.png).

Las mediciones se registran en [campus-street-performance.json](campus-street-performance.json).
Son ventanas de ocho segundos en Chrome/ANGLE D3D11 sobre una RTX 3060 Ti, con
calidad adaptativa predeterminada. No equivalen a una garantía en todos los móviles.

| Vista | Resolución interna | FPS | GPU p95 |
| --- | --- | ---: | ---: |
| General | 1920×1080 | 60 | 5,42 ms |
| Persecución en espiral | 1920×1080 | 60 | 7,42 ms |
| Cuatro cámaras nocturnas | 1536×864 | 60 | 7,05 ms |
| Persecución entre edificios | 1920×1080 | 60 | 6,59 ms |
| Cuatro cámaras nocturnas en el campus | 1536×864 | 60 | 7,58 ms |

Ninguna muestra superó los 25 ms por cuadro; máximo registrado: 16,9 ms.
