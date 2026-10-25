/**
 * The showcase banner (D8, ticket 868; GD 04:53): in the HUD's banner slot, the name of the charge
 * whose first blast after its first purchase just played, with its size under it, coming in,
 * holding and fading on the authority's clock. Never takes a click; draws nothing at rest, so the
 * HUD's resting markup is unchanged. Reads only the slice's banner record.
 */
import { useScreenModel } from '../../../ui/useScreenModel'
import { readShowcaseBanner, type ShowcaseBannerModel } from '../store/showcaseBanner'
import styles from './BlastShowcaseBanner.module.css'
import { DYNAMITE_VISUALS_TEST_IDS } from './testIds'

export function BlastShowcaseBanner() {
  const banner = useScreenModel(readShowcaseBanner)
  if (banner === null) return null
  return <BlastShowcaseBannerView banner={banner} />
}

export function BlastShowcaseBannerView({ banner }: { banner: ShowcaseBannerModel }) {
  return (
    <div
      className={styles.banner}
      role="status"
      data-testid={DYNAMITE_VISUALS_TEST_IDS.showcaseBanner}
      data-phase={banner.phase}
    >
      <span className={styles.title}>New charge</span>
      <strong className={styles.name}>{banner.name}</strong>
      <span className={styles.size}>{banner.sizeLine}</span>
    </div>
  )
}
