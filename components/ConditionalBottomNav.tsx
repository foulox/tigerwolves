import BottomNav from './BottomNav'
import TourMount from './TourMount'

type Props = { isLeader: boolean }

// #332 Home flip — with the /runner prototype and its separate RunnerNav removed,
// BottomNav is the single app nav on every route. This wrapper just co-mounts the
// tour with it; the old /runner path-suppression is gone.
export default function ConditionalBottomNav({ isLeader }: Props) {
  return (
    <>
      <TourMount isLeader={isLeader} />
      <BottomNav isLeader={isLeader} />
    </>
  )
}
