import React, { Component } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.log('[ErrorBoundary] React UI crash caught:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  componentDidMount() {
    // Intercept global unhandled JS runtime crashes
    if (global.ErrorUtils) {
      const defaultHandler = global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.log('[ErrorBoundary] Global JS crash caught:', error, 'isFatal:', isFatal);
        this.setState({ hasError: true, error });
        
        // Let the default handler log or process if it's not fatal
        if (defaultHandler && !isFatal) {
          defaultHandler(error, isFatal);
        }
      });
    }
  }

  handleRestart = () => {
    try {
      const DevSettings = require('react-native').DevSettings;
      if (DevSettings && DevSettings.reload) {
        DevSettings.reload();
      } else {
        this.setState({ hasError: false, error: null, errorInfo: null });
      }
    } catch {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error ? this.state.error.toString() : 'Unknown Error';
      const errorStack = this.state.error && this.state.error.stack ? this.state.error.stack.toString() : '';
      const componentStack = this.state.errorInfo && this.state.errorInfo.componentStack ? this.state.errorInfo.componentStack.toString() : '';

      return (
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Feather name="alert-octagon" size={48} color="#EF4444" />
            </View>
            <Text style={styles.title}>May Naganap na Problema</Text>
            <Text style={styles.subtitle}>
              Paumanhin, may hindi inaasahang error na naganap sa system. Subukang i-restart ang app o mag-sign in muli.
            </Text>
            
            <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
              <Feather name="refresh-cw" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>I-restart ang App</Text>
            </TouchableOpacity>

            {/* Scrollable Error Log Container */}
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Error Details:</Text>
              <ScrollView style={styles.errorScrollView}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                {errorStack ? <Text style={styles.stackText}>Stack Trace:{"\n"}{errorStack}</Text> : null}
                {componentStack ? <Text style={styles.stackText}>Component Stack:{"\n"}{componentStack}</Text> : null}
              </ScrollView>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F2C59',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: '#0F2C59',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2C5940',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorContainer: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
    maxHeight: 250,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  errorScrollView: {
    width: '100%',
  },
  errorText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    marginBottom: 10,
  },
  stackText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    color: '#4B5563',
    lineHeight: 14,
    marginTop: 6,
  },
});
