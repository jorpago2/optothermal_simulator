# Optothermal Simulator

## Carbon y diseño

- Usa la versión instalada de `@carbon/react` y los componentes de Carbon cuando mejoren la interacción, pero no fuerces una composición poco clara.
- Consulta la documentación oficial al introducir un componente, resolver una duda de comportamiento o sobrescribir estilos internos; no conviertas cada reutilización evidente en una investigación.
- Evalúa la interfaz renderizada: jerarquía, proporción, legibilidad, accesibilidad, estados de interacción y comportamiento responsive importan tanto como compilar.

## Propiedad React, Worker y WASM

- React es el único propietario de la estructura, visibilidad, atributos ARIA, estado visual y eventos de los componentes que renderiza.
- `src/solver/solver.worker.ts` y el núcleo Rust/WebAssembly resuelven la simulación; `workerClient.ts` es la frontera de cancelación y resultados. Ninguno debe guardar referencias permanentes ni modificar directamente el DOM de React.
- Mantén el protocolo de mensajes y la serialización ABI sincronizados entre TypeScript y Rust. La UI inicia o cancela cálculos mediante el cliente del worker y representa sus resultados; no introduzcas eventos globales ni listeners imperativos sobre controles que ya gestiona React.
- Conserva unidades, validación, diagnósticos y límites físicos del modelo. Una mejora visual no debe cambiar el contrato numérico sin una razón explícita.

## `scientific-ui`

- Corrige por defecto los problemas específicos dentro de este simulador.
- Modifica `scientific-ui` solo cuando la causa pertenezca realmente al componente compartido y la corrección deba propagarse a sus consumidores.
- Al actualizar el paquete vendorizado, cambia conjuntamente `package.json`, `pnpm-lock.yaml` y `vendor/jorpago2-scientific-ui-*.tgz`, y comprueba que el nuevo tarball quede rastreado por Git.

## Camino rápido por defecto

- Atiende una familia concreta de problemas por iteración y evita auditorías generales no solicitadas.
- Para un cambio localizado, inspecciona la implementación relevante, el estado afectado y una resolución representativa adicional.
- Entrega primero una iteración visible y comprobable; amplía el trabajo solo si el resultado o el riesgo lo justifican.
- No ejecutes suites completas, matrices extensas, benchmarks ni validaciones científicas para ajustes visuales localizados.
- Si el diagnóstico crece sin una causa clara, informa de lo comprobado antes de ampliar el alcance.

## Subagentes

- Usa subagentes `gpt-5.6-luna` con razonamiento `max` en paralelo cuando existan partes independientes y la delegación mejore claramente la velocidad, cobertura o calidad.
- Asigna a cada subagente un alcance concreto y sin solapamientos; el agente principal conserva la integración y la verificación final.
- Evita que varios subagentes editen simultáneamente el mismo archivo. Revisa siempre el diff y el estado integrado; no des por válida una comprobación declarada por un subagente sin verificar el resultado final.
- No uses subagentes para cambios pequeños, secuenciales o fuertemente acoplados cuando coordinar cueste más que resolverlos directamente.

## Verificación proporcional

- Para tareas visuales o de interacción, usa `$browser:control-in-app-browser` cuando esté disponible y comprueba la pantalla y el flujo afectado antes y después del cambio.
- Reutiliza `pnpm dev` y HMR durante la iteración. El script `predev` regenera el WASM; no reconstruyas producción después de cada ajuste.
- Cambio visual localizado: navegador interno y la resolución afectada.
- Cambio React/TypeScript: `pnpm typecheck` y el flujo afectado.
- Cambio en el worker, protocolo, validación o Rust/WASM: `pnpm build:wasm` cuando proceda y `pnpm test` para el contrato completo del solver.
- Cambio de conformidad de componentes: `pnpm check:conformance` cuando sea relevante.
- Cambio de pruebas de navegador: `pnpm test:ui`.
- Integración o publicación: `pnpm build` cuando el cambio esté integrado o antes de publicarlo.
- Usa `pnpm preview` solo para comprobar el artefacto construido. Informa solo de verificaciones ejecutadas y mantén separadas la validez física y la calidad visual salvo que el cambio afecte a ambas.
