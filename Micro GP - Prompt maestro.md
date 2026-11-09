# Micro GP · Taller 07
## Prompt maestro de implementación

Crea **Micro GP · Taller 07**, un juego web 3D de carreras de autitos en una maqueta de Gran Premio. Una pantalla compartida muestra toda la carrera desde una cámara fija. Cada persona escanea el mismo QR físico de la maqueta y convierte su celular en un mando arcade de **una palanca y dos botones**. Entrega un juego ejecutable de principio a fin.

## 1. Dos pantallas y un solo mundo

- **Pantalla compartida.** Al abrirla aparece el circuito ya en movimiento. Todo lo visible pertenece a la maqueta: pista, autos, semáforo, tablilla de vueltas y resultados, bandera y placa con un único QR abajo a la derecha. Excluye HUD, menú, minimapa, velocímetro, punteros, nombres flotantes, avisos superpuestos y barras de progreso. Mantén estas reglas durante el arranque, la carrera y el resultado.
- **Celular.** El QR abre directamente un mando en el navegador y asigna un autito automáticamente. La pantalla del teléfono se ve como el frente de un control arcade físico. Solo hay tres controles interactivos: la palanca, FRENO y GAS. La carrera se mira en la pantalla compartida.
- Haz jugable el ciclo completo con 1 a 4 celulares. Los autos sin conductor humano los maneja la IA.

## 2. Dirección visual

Imagina un circuito de motos de asfalto, inspirado en la geometría de los Grandes Premios, construido sobre un tablero de contrachapado de abedul en un taller. Los protagonistas son cuatro autitos de metal fundido tipo Micro Machines, de escala visual aproximada 1:64. Usa carrocerías originales, con ruedas de goma visibles, proporciones de juguete y dorsales en el techo. Diseña cuatro siluetas reconocibles con el mismo rendimiento: **07 compacto cian**, **21 cupé bermellón**, **34 bólido amarillo redondeado** y **58 cuña violeta**.

El asfalto es grafito mate. Los pianos alternan rojo y marfil. Las escapatorias son verde oscuro. Las capas de la madera, las vallas bajas, las torres de focos y una llave inglesa sobredimensionada hacen visible la escala. Ilumina con lámparas cálidas de taller y relleno frío discreto. Deja las herramientas grandes fuera de la línea de visión de los autos. Usa reflejos cortos y sombras de contacto. Reserva la profundidad de campo fuerte para imágenes promocionales. Durante la carrera, toda la pista permanece nítida.

Si se adjuntan las referencias, úsalas así:

1. **01-carrera.png** fija el encuadre, la escala, los materiales y la ubicación de la placa inferior derecha. Su placa está vacía porque el QR lo genera la aplicación.
2. **02-detalle.png** guía carrocerías, pianos, madera, vallas e iluminación. Su cámara baja es una referencia de materiales.
3. **03-mando.png** guía el mando horizontal. Coloca FRENO hacia el centro, GAS hacia el borde derecho y la palanca a la izquierda.
4. **04-plano.png** fija la geometría y el sentido de carrera. Prioriza el plano sobre pequeñas diferencias de forma en el arte conceptual.

Construye la escena con geometría 3D, iluminación y materiales en tiempo real. Usa las referencias como guía visual, sin convertirlas en fondos del juego.

## 3. Trazado y cámara

Un circuito cerrado, antihorario y sin cruces. La **Recta de Boxes** cruza el primer plano de izquierda a derecha. Sigue la **Horquilla** de la derecha, la **Ese Alta** del fondo y el **Curvón** de la izquierda antes de volver a meta. Coloca cuatro cajones de parrilla antes de la línea a cuadros. Mantén boxes, vallas y escenografía fuera de la superficie transitable.

Usa la siguiente línea central como guía geométrica reproducible. El plano tiene 1.000 × 450 unidades, con X hacia la derecha y Y hacia abajo. Un ancho de auto equivale a 16 unidades. El asfalto mide 78 unidades de ancho, con pianos y escapatorias a los lados. Centra el trazado en el mundo, muestrea sus curvas a distancia aproximadamente uniforme y genera la malla de pista, la ruta de IA y los puntos de control a partir de la misma línea. El punto inicial es la meta.

```svg
M 440 364 L 722 364
C 813 364 891 315 900 245
C 910 167 864 141 815 136
C 776 132 754 119 728 94
C 690 58 647 66 601 90
C 563 110 542 130 505 129
C 467 128 434 101 392 86
C 337 67 271 64 222 78
C 157 96 123 144 113 202
C 100 271 127 329 183 349
C 212 360 244 364 292 364
L 440 364 Z
```

Levanta suavemente la Ese Alta hasta un ancho de auto de altura, con transición continua y pendientes de hasta 8 %. Haz que la simulación siga la superficie. Evita que los props tapen a los corredores, en especial en la Horquilla. Ajusta una cámara perspectiva elevada de tres cuartos, aproximadamente 50° hacia abajo. Encuadra la pista entera, mantén los cuatro autos reconocibles en el tramo más lejano y preserva la esquina inferior derecha para el QR. Usa 16:9 como referencia y conserva pista y placa completas al adaptar la relación de aspecto. La cámara es estable en toda la sesión.

## 4. Carrera y conducción

- **Exhibición y parrilla.** Con cero mandos, los cuatro bots hacen correr la maqueta. El primer mando inicia una manga humana y la parrilla se forma en un máximo de tres segundos. Tres luces físicas se encienden de forma escalonada. Al apagarse todas se libera la salida.
- **Manga.** Tres vueltas y cuatro autos. Objetivo inicial de 18 a 24 s por vuelta con conducción limpia. Cuenta una vuelta al cruzar la meta hacia delante después de pasar en orden por las puertas invisibles de Horquilla, Ese Alta y Curvón. La salida desde parrilla arma la vuelta sin sumarla. Calcula posiciones por vueltas, último control válido y avance sobre el tramo, de modo que retroceder o cortar curvas nunca otorgue progreso.
- **Entradas durante la manga.** Si queda un bot libre, transfiere su auto al nuevo mando en el siguiente tick sin teletransportarlo ni cambiar la posición de carrera. La clasificación corresponde al auto. Los mandos conservan su auto entre mangas mientras sigan conectados.
- **Llegada.** Muestra la bandera en la meta y el orden de llegada en una tablilla física, con dorsal y color. La tablilla muestra antes las vueltas del líder. Cierra la manga cuando terminan los cuatro o a los 15 s de la primera llegada, ordenando a los que falten por progreso válido. Deja el resultado visible 6 s y vuelve a la parrilla automáticamente. Si se vacía la sala, continúa en exhibición.
- **Sensación.** Respuesta arcade rápida, aceleración progresiva, frenada marcada, inercia corta y un deslizamiento leve recuperable. Al soltar GAS, el auto rueda y pierde velocidad. Cede agarre en los pianos y desacelera en la escapatoria. Las colisiones deben quitar velocidad sin lanzar el auto fuera del circuito. Recupera un auto volcado, fuera de pista o atascado durante más de 2,5 s con intención de avanzar. Recolócalo orientado en el último tramo válido, sin sumar progreso y con un breve margen contra choques. Usa luces de emergencia físicas como aviso.
- **Sonido y lectura.** Motores pequeños, neumático y golpecitos contra barreras, más un tono de largada. Mantén salida, vueltas y llegada entendibles en silencio. Respeta el desbloqueo de audio del navegador.

## 5. QR y mando arcade

**QR en la maqueta.** Monta una placa mate frente a la cámara en la esquina inferior derecha, fuera de la calzada y sin oclusiones. Renderiza un solo QR real, generado a partir de la URL absoluta y alcanzable de la sesión. Parte de 160 a 200 px de lado en una salida de 1080p y calibra a la distancia real de uso. Conserva alto contraste negro sobre blanco, cuatro módulos de zona de silencio, bordes nítidos y ausencia de reflejos, deformación o desenfoque. Mantén la placa en su zona segura durante exhibición, carrera y llegada. La textura se actualiza solo si cambia la URL de sala.

**Mando.** Diseña plástico grafito, pomo marfil, FRENO bermellón y GAS cian. Usa etiquetas legibles, áreas táctiles de al menos 64 px CSS y separación suficiente para pulsar sin errores. En horizontal, palanca a la izquierda y botones a la derecha. En vertical, coloca los controles en la mitad inferior en una disposición que conserve los dos pulgares. Respeta las áreas seguras del dispositivo. Una luz piloto y un dorsal pasivo identifican el auto. Un piloto apagado o intermitente y una leyenda discreta pueden comunicar «Conectando», «Reconectando» o «Sala completa» en el mando.

- **Palanca.** Retorno al centro y giro analógico con el eje X entre −1 y +1, zona muerta inicial de 0,12. El eje Y queda sin asignación. Al soltar, vuelve a cero.
- **GAS.** Acelera mientras se mantiene pulsado.
- **FRENO.** Frena mientras se mantiene pulsado y tiene prioridad sobre GAS. Para dar marcha atrás lentamente, el auto debe estar detenido y se debe soltar y volver a presionar FRENO. Suéltalo para salir de marcha atrás.
- Implementa multitáctil real con un identificador de puntero por control. Captura el puntero durante la pulsación. Limpia entradas en fin, cancelación, pérdida de captura, pérdida de foco, ocultación de la página y desconexión. Al volver, espera un toque nuevo. La palanca y un botón deben poder usarse al mismo tiempo sin desplazar la página.

## 6. Implementación y enlace real

Usa TypeScript, Three.js y Vite para las dos vistas, con un servidor Node.js y WebSockets para sala, simulación e inputs. El servidor es la autoridad de plazas, posiciones, colisiones, vueltas y resultado. Separa simulación, render y entradas. Corre la simulación a paso fijo, con objetivo de 60 Hz. Envía estados a la pantalla compartida a unos 20 Hz e interpola el render. El mando transmite estado de entrada completo y secuencia a unos 30 Hz mientras está activo. Valida rangos y descarta mensajes antiguos o de una conexión que ya perdió su plaza.

- La vista compartida crea o recupera su sala. El QR apunta a una ruta de mando con un token opaco de sala. Usa una URL alcanzable desde otros dispositivos, configurada en `PUBLIC_ORIGIN`. Usa HTTPS y WSS en el despliegue público. Documenta el acceso de prueba por red local con la IP real de la máquina y el puerto accesible. Rechaza una configuración con loopback como URL para teléfonos.
- Asigna como máximo cuatro plazas humanas. La quinta conexión muestra «Sala completa» en su celular sin modificar la carrera. Al reabrir el mando dentro de 15 s, recupera el mismo auto mediante un identificador de reconexión asociado a la sala. Una conexión nueva del mismo mando reemplaza la anterior, sin duplicar plazas. Después del plazo, la plaza queda libre.
- Si pasan 250 ms sin entrada válida, neutraliza palanca y pedales en el servidor. Si la interrupción supera 1 s, el bot continúa con el auto mientras la plaza queda reservada hasta que expire el plazo. Evita movimientos residuales al reconectar.
- Empieza con geometría, texturas y audio reproducibles en el proyecto. Usa GLB para los modelos externos que decidas incorporar. Mantén una sesión estable con cuatro autos a 1080p como objetivo, con densidad de píxeles y sombras ajustables. Mantén herramientas de desarrollo fuera de la presentación normal.

## 7. Entrega y aceptación

Entrega el código y los recursos, un README con arranque, compilación y despliegue, y un resumen de lo que verificaste. Construye primero el ciclo carrera y mando con geometría simple. Valida la conexión entre dispositivos antes de subir el detalle visual. Reporta qué navegadores y teléfonos probaste realmente.

1. En la pantalla compartida aparecen los cuatro autitos y la pista entera, con semáforo, tablilla y bandera como objetos. Hay exactamente un QR en la esquina inferior derecha.
2. Un iPhone con Safari y un Android con Chrome escanean el mismo QR desde la distancia prevista, abren el mando sin instalar una app y conducen autos distintos. Prueba también cuatro plazas ocupadas y una quinta conexión.
3. Giro y GAS funcionan en simultáneo. FRENO tiene prioridad. Soltar, cambiar de pestaña, apagar la pantalla o cortar la red neutraliza los inputs. Reconectar a tiempo recupera el mismo auto con entradas neutras.
4. La parrilla y el semáforo arrancan solos. Saltar una puerta, cruzar meta en reversa o ser recolocado no regala vueltas. Se completa una manga de tres vueltas, se lee el resultado físico y empieza otra automáticamente.
5. La pista y el QR permanecen a la vista tras cambiar la resolución y durante toda la carrera. El mando funciona en horizontal y vertical, sin elementos interactivos adicionales.
