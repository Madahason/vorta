import { Component } from 'react'
import { AbsoluteFill } from 'remotion'

export class ErrorBoundaryScene extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error) {
    console.error('[Scene error]', this.props.scene?.scene_id, error.message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <AbsoluteFill style={{
          backgroundColor: '#0a0a0a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, fontFamily: 'sans-serif' }}>
            Scene {this.props.scene?.scene_id}
          </div>
          <div style={{ color: 'rgba(239,68,68,0.5)', fontSize: 11, fontFamily: 'sans-serif' }}>
            {this.state.error?.message?.slice(0, 80)}
          </div>
        </AbsoluteFill>
      )
    }
    return this.props.children
  }
}
