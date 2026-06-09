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
          backgroundColor: '#1a0000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
        }}>
          <div style={{ color: '#f87171', fontSize: 14, fontFamily: 'sans-serif', textAlign: 'center', padding: 20 }}>
            Scene {this.props.scene?.scene_id} error{'\n'}
            {this.state.error?.message?.slice(0, 100)}
          </div>
        </AbsoluteFill>
      )
    }
    return this.props.children
  }
}
