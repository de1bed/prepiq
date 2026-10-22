# 6. Personal, horarios y asistencia

Referente de experiencia: herramientas tipo HotSchedules (calendario, cambios, reloj). **No** es una integración ni se asume una [H]. **No** se calcula nómina [H].

## Horarios
- Vista semanal por persona (lunes a domingo) en la **zona horaria del restaurante**.
- Turno: persona (o *turno abierto*), rol, estación, inicio, fin, descanso, notas. Si la hora de salida es menor que la de entrada, **termina al día siguiente** (ej. 17:00–01:00) y se marca con 🌙.
- Reglas: sin empalmes para la misma persona; máximo 16 h; **borrador** invisible al equipo hasta **Publicar semana**; editar un turno publicado queda auditado.
- Copiar la semana anterior como borrador (omite los que se empalmarían).
- Horas programadas por persona en la semana; ausencias aprobadas se resaltan.

## Solicitudes
- **Ausencia**: la persona la pide en *Mi espacio*; un gerente aprueba o rechaza (nadie se aprueba a sí mismo).
- **Cambio de turno**: la persona cede su turno (a alguien o abierto) → un compañero lo acepta → el gerente aprueba (se valida que no se empalme) → el turno cambia de dueño.
- **Disponibilidad** semanal: cada persona la declara en *Mi espacio* (día, horario, disponible / no disponible). Al programar un turno, el gerente ve la disponibilidad declarada de esa persona para ese día.

## Asistencia (reloj checador)
- En el dispositivo *reloj*: PIN → saludo con última marca y turno de hoy → botón grande con las acciones válidas (entrada / inicio de descanso / fin de descanso / salida). Sesión de 2 minutos; "No soy yo" para salir.
- Secuencia validada en servidor. Salir estando en descanso cierra el descanso automáticamente.
- **Sin conexión:** la marca se guarda con la hora del dispositivo y se envía al reconectar; el servidor la acepta solo si ocurrió durante la sesión de PIN y la marca "sin conexión" para revisión.
- **Desde el celular personal:** desactivado por defecto (no verificamos ubicación); se habilita en Administración → Restaurante.
- **Correcciones:** "Olvidé marcar" crea una solicitud; un gerente la aprueba (si el gerente corrige a otra persona, queda aprobada con su nombre). Las marcas originales **nunca se borran**: se anulan con referencia a la corrección.
- **Turno sin salida:** al registrar una nueva entrada >18 h después se permite y se crea una incidencia para corregir.
- Reporte semanal: entrada, salida, descanso, horas registradas, turno programado, marcas sin conexión o corregidas. Exportación a nómina: fuera de alcance [H].
