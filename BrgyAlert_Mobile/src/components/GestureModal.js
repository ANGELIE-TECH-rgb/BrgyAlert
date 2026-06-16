import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function GestureModal({
  visible,
  onClose,
  title,
  children,
  contentStyle,
  keyboardAvoiding = false,
}) {
  const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(panY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(panY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5; // only swipe down
      },
      onPanResponderGrant: () => {
        panY.setOffset(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          Animated.timing(panY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  const handleClose = () => {
    Animated.timing(panY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const ContainerComponent = keyboardAvoiding ? KeyboardAvoidingView : View;
  const containerProps = keyboardAvoiding
    ? { behavior: Platform.OS === 'ios' ? 'padding' : 'height' }
    : {};

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={handleClose}
    >
      <ContainerComponent style={styles.modalOverlay} {...containerProps}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <Animated.View
          style={[
            styles.modalContent,
            contentStyle,
            { transform: [{ translateY: panY }] }
          ]}
          onStartShouldSetResponder={() => true} // stop event bubbling
        >
          <TouchableOpacity
            style={styles.dragHandleContainer}
            {...panResponder.panHandlers}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <View style={styles.modalHandle} />
          </TouchableOpacity>

          {title ? <Text style={styles.modalTitle}>{title}</Text> : null}

          {children}
        </Animated.View>
      </ContainerComponent>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dragHandleContainer: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 16,
    textAlign: 'center',
  },
});
