import { Composition } from 'remotion'
import { Documentary, calculateDocumentaryDuration } from './compositions/Documentary'
import AnimatedCounter from './components/AnimatedCounter'
import TimelineBar     from './components/TimelineBar'
import ComparisonChart from './components/ComparisonChart'
import QuoteCard       from './components/QuoteCard'
import MapHighlight    from './components/MapHighlight'

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Documentary"
        component={Documentary}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scenes: [], imagePaths: {} }}
        calculateMetadata={({ props }) => ({
          durationInFrames: calculateDocumentaryDuration(props.scenes),
        })}
      />

      {/* Individual component previews for Remotion Studio */}
      <Composition id="AnimatedCounter" component={AnimatedCounter} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ value: 3000000000, label: 'Revenue', prefix: '$' }} />

      <Composition id="TimelineBar" component={TimelineBar} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ title: 'Key Milestones', events: [
          { year: '1997', label: 'Founded' },
          { year: '2001', label: 'First Product' },
          { year: '2007', label: 'Breakthrough' },
          { year: '2012', label: 'Global Expansion' },
          { year: '2020', label: 'IPO' },
        ]}} />

      <Composition id="ComparisonChart" component={ComparisonChart} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ title: 'Market Share', unit: '%', items: [
          { label: 'Before', value: 12 },
          { label: 'After',  value: 67 },
        ]}} />

      <Composition id="QuoteCard" component={QuoteCard} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ text: 'This changes everything.', attribution: 'CEO, 2007', style: 'center' }} />

      <Composition id="MapHighlight" component={MapHighlight} fps={30} width={1920} height={1080} durationInFrames={150}
        defaultProps={{ region: 'Silicon Valley', lat: 37.4, lng: -122.0, label: 'Cupertino, CA' }} />
    </>
  )
}
