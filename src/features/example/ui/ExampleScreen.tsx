/**
 * The example slice's full screen: what a slice screen gets from the kernel shell (ticket 211).
 * No player control opens it; `steampunkDebug.ui.openScreen('example.screen')` does, for the
 * kernel e2e that opens and dismisses one.
 */
import { Button } from '../../../ui/kit/Button'
import { Panel } from '../../../ui/kit/Panel'
import type { ScreenProps } from '../../../ui/registries/screens'

export const EXAMPLE_SCREEN_ID = 'example.screen'

export function ExampleScreen({ onDismiss }: ScreenProps) {
  return (
    <Panel title="Example screen">
      <p>A slice draws its own full screen here; Escape or Back closes it.</p>
      <Button label="Back" onPress={onDismiss} />
    </Panel>
  )
}
