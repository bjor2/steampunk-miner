/** The hint and transmission plaques: the store's plaque model, re-read as it changes. */
import { readPlaqueModel } from '../../store/screenReads'
import { useScreenModel } from '../useScreenModel'
import { PlaquesView } from './PlaquesView'

export function Plaques() {
  return <PlaquesView model={useScreenModel(readPlaqueModel)} />
}
