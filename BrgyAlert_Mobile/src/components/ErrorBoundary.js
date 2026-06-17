import React, { Component } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.log('[ErrorBoundary] React UI crash caught:', error, errorInfo);
  }

  componentDidMount() {
    // Intercept global unhandled JS runtime crashes
    if (global.ErrorUtils) {
      const defaultHandler = global.ErrorUtils.getGlobalHandler();
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.log('[ErrorBoundary] Global JS crash caught:', error, 'isFatal:', isFatal);
        this.setState({ hasError: true });
        
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
        this.setState({ hasError: false });
      }
    } catch {
      this.setState({ hasError: false });
    }
  };

  render() {
    if (this.state.hasError) {
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
});
