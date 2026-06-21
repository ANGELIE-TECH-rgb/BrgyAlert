import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc, updateDoc, where, getDocs, increment, writeBatch } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import { checkChatMessageStatus, recordChatMessageSent } from '../../services/rateLimiter';
import { sanitizeText } from '../../services/inputSanitizer';
import { setActiveChat, sendAndSaveNotification } from '../../services/notificationService';
import { notifyAllAdmins } from '../../services/adminNotifier';

export default function ChatScreen({ route, navigation }) {
  const { alertId, userId, userName } = route.params || {};
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'responder';

  const [currentAlertId, setCurrentAlertId] = useState(alertId || null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [citizenProfile, setCitizenProfile] = useState(null);

  // Typing animation & status refs/states
  const typingTimeoutRef = useRef(null);
  const localIsTypingRef = useRef(false);
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const isOtherTyping = isAdmin 
    ? activeAlert?.typingCitizen === true 
    : activeAlert?.typingAdmin === true;

  const updateTypingStatus = async (typing) => {
    if (!currentAlertId || !user) return;
    if (localIsTypingRef.current === typing) return;
    localIsTypingRef.current = typing;

    try {
      const alertDocRef = doc(db, 'alerts', currentAlertId);
      if (isAdmin) {
        await updateDoc(alertDocRef, { typingAdmin: typing });
      } else {
        await updateDoc(alertDocRef, { typingCitizen: typing });
      }
    } catch (err) {
      console.log('Error updating typing status:', err);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);

    if (text.trim().length > 0) {
      updateTypingStatus(true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        updateTypingStatus(false);
      }, 3000);
    } else {
      updateTypingStatus(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  useEffect(() => {
    if (isOtherTyping) {
      const animateDot = (dot, delay) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, {
              toValue: -6,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.delay(250),
          ])
        );
      };

      const anim = Animated.parallel([
        animateDot(dot1, 0),
        animateDot(dot2, 125),
        animateDot(dot3, 250),
      ]);
      anim.start();

      return () => {
        anim.stop();
        dot1.setValue(0);
        dot2.setValue(0);
        dot3.setValue(0);
      };
    }
  }, [isOtherTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
    };
  }, [currentAlertId]);

  // Set active chat globally to suppress local banners for this thread
  useEffect(() => {
    setActiveChat(currentAlertId);
    return () => {
      setActiveChat(null);
    };
  }, [currentAlertId]);

  // Admin states for multiple incidents selection
  const [userAlerts, setUserAlerts] = useState([]);
  const [showIncidentSelector, setShowIncidentSelector] = useState(false);

  // Resolve target citizen details and list all their reports (for admin)
  useEffect(() => {
    const resolveUserAlerts = async () => {
      let targetUserId = userId;

      // If admin came via IncidentDetail, we only have alertId initially. Resolve its userId first.
      if (isAdmin && alertId && !targetUserId) {
        try {
          const docSnap = await getDoc(doc(db, 'alerts', alertId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            targetUserId = data.userId || data.phoneNumber || alertId;
            if (targetUserId === 'anonymous') {
              targetUserId = data.phoneNumber || alertId;
            }
          }
        } catch (err) {
          console.log('Error resolving alert userId:', err);
        }
      }

      if (isAdmin && targetUserId) {
        let q;
        if (targetUserId.startsWith('+') || /^\d+$/.test(targetUserId)) {
          // Phone number
          q = query(
            collection(db, 'alerts'),
            where('phoneNumber', '==', targetUserId),
            orderBy('createdAt', 'desc')
          );
        } else if (targetUserId === alertId || targetUserId === 'anonymous') {
          // Single anonymous fallback
          try {
            const docSnap = await getDoc(doc(db, 'alerts', alertId));
            if (docSnap.exists()) {
              setUserAlerts([{ id: docSnap.id, ...docSnap.data() }]);
            }
            if (!currentAlertId) {
              setCurrentAlertId(alertId);
            }
          } catch (err) {
            console.log('Error fetching fallback anonymous alert:', err);
          }
          return;
        } else {
          // Standard userId
          q = query(
            collection(db, 'alerts'),
            where('userId', '==', targetUserId),
            orderBy('createdAt', 'desc')
          );
        }

        try {
          const snap = await getDocs(q);
          const list = [];
          snap.forEach((d) => {
            list.push({
              id: d.id,
              ...d.data(),
            });
          });
          setUserAlerts(list);

          // If no alertId was passed, default to the latest alert in the list
          if (!currentAlertId && list.length > 0) {
            setCurrentAlertId(list[0].id);
          }
        } catch (err) {
          console.log('Error fetching user alerts for selector:', err);
        }
      }
    };

    resolveUserAlerts();
  }, [alertId, userId, isAdmin]);

  // Fetch current active alert metadata
  useEffect(() => {
    if (!currentAlertId) return;

    const unsubscribe = onSnapshot(doc(db, 'alerts', currentAlertId), (docSnap) => {
      if (docSnap.exists()) {
        setActiveAlert({
          id: docSnap.id,
          ...docSnap.data(),
        });
      }
    });

    return () => unsubscribe();
  }, [currentAlertId]);

  // Subscribe to citizen profile to get the latest name dynamically
  useEffect(() => {
    if (!isAdmin || !activeAlert?.userId) {
      setCitizenProfile(null);
      return;
    }

    const userDocRef = doc(db, 'users', activeAlert.userId);
    const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
      if (userSnap.exists()) {
        setCitizenProfile(userSnap.data());
      }
    }, (err) => {
      console.log('Error listening to citizen profile in ChatScreen:', err);
    });

    return () => unsubscribeUser();
  }, [isAdmin, activeAlert?.userId]);

  // Subscribe to real-time chat messages for the current alert
  useEffect(() => {
    if (!currentAlertId || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const messagesRef = collection(db, 'alerts', currentAlertId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        const unreadMsgDocsToUpdate = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            ...data,
          });

          // Mark incoming messages as read
          if (data.senderId !== user.uid && !data.read) {
            unreadMsgDocsToUpdate.push(docSnap.id);
          }
        });

        setMessages(list);
        setLoading(false);

        // Update read status for incoming messages
        if (unreadMsgDocsToUpdate.length > 0) {
          unreadMsgDocsToUpdate.forEach(async (msgId) => {
            try {
              await updateDoc(doc(db, 'alerts', currentAlertId, 'messages', msgId), {
                read: true,
              });
            } catch (err) {
              console.log('Error marking message read:', err);
            }
          });
        }

        // Reset corresponding unread counter on the parent alert document
        const resetParentUnread = async () => {
          try {
            const alertDocRef = doc(db, 'alerts', currentAlertId);
            if (isAdmin) {
              await updateDoc(alertDocRef, { unreadCountAdmin: 0 });
            } else {
              await updateDoc(alertDocRef, { unreadCountCitizen: 0 });
            }

            // Also mark related notifications as read
            const notifQuery = query(
              collection(db, 'users', user.uid, 'notifications'),
              where('relatedId', '==', currentAlertId),
              where('type', '==', 'message'),
              where('read', '==', false)
            );
            const notifSnap = await getDocs(notifQuery);
            if (!notifSnap.empty) {
              const batch = writeBatch(db);
              notifSnap.forEach((d) => {
                const ref = doc(db, 'users', user.uid, 'notifications', d.id);
                batch.update(ref, { read: true });
              });
              await batch.commit();
            }
          } catch (err) {
            console.log('Error resetting alert unread count:', err);
          }
        };
        resetParentUnread();

        // Scroll to end upon receiving messages
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (error) => {
        console.log('Error listening to messages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentAlertId, isAdmin, user]);

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || !currentAlertId) return;

    // Verify email requirement for citizens
    if (!isAdmin && user && !user.emailVerified) {
      Alert.alert(
        'Email Verification Required',
        'You must verify your email address before sending coordination messages to responders.',
        [
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    // Rate limit check for citizen messages (lenient)
    if (!isAdmin) {
      const rateStatus = await checkChatMessageStatus();
      if (rateStatus.locked) {
        Alert.alert('Rate Limited', `Please wait ${rateStatus.secondsRemaining} seconds before sending another message.`);
        return;
      }
    }

    const messageText = sanitizeText(inputText.trim(), 500);
    if (!messageText) return; // do not send empty/stripped messages
    setInputText('');

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateTypingStatus(false);

    try {
      const messagesRef = collection(db, 'alerts', currentAlertId, 'messages');
      
      // 1. Add message to Firestore subcollection
      await addDoc(messagesRef, {
        text: messageText,
        senderId: user.uid,
        senderName: userProfile?.fullName || 'User',
        senderRole: userProfile?.role || 'citizen',
        createdAt: serverTimestamp(),
        read: false,
      });

      // 2. Update metadata in parent alert document
      const updateData = {
        lastMessageText: messageText,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid,
      };

      if (isAdmin) {
        updateData.unreadCountCitizen = increment(1);

        // Directly save notification to the citizen's Firestore subcollection.
        // This is more reliable than waiting for the citizen's onSnapshot listener,
        // which only works if the citizen's app is active and online.
        const citizenId = activeAlert?.userId;
        if (citizenId && citizenId !== 'anonymous' && citizenId !== user.uid) {
          sendAndSaveNotification(citizenId, {
            title: `💬 Message from Barangay Command Center`,
            body: messageText.length > 80 ? messageText.substring(0, 80) + '...' : messageText,
            type: 'message',
            relatedId: currentAlertId,
          }, true /* skipLocalNotification — citizen is on a different device */).catch((e) => console.log('[ChatScreen] Could not save citizen notification:', e));
        }
      } else {
        updateData.unreadCountAdmin = increment(1);
        // Record chat message sent for rate limiting
        await recordChatMessageSent();

        // Notify all admins/responders directly — works even if their app is in background
        const reporterName = userProfile?.fullName || 'Citizen';
        const alertCategory = activeAlert?.category || 'Incident';
        notifyAllAdmins(user.uid, {
          title: `💬 Message from ${reporterName}`,
          body: messageText.length > 80 ? messageText.substring(0, 80) + '...' : messageText,
          type: 'message',
          relatedId: currentAlertId,
        }).catch((e) => console.log('[ChatScreen] Could not notify admins of message:', e));
      }

      await updateDoc(doc(db, 'alerts', currentAlertId), updateData);
    } catch (err) {
      console.log('Error sending message:', err);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!currentAlertId) return;
    try {
      await updateDoc(doc(db, 'alerts', currentAlertId), {
        status: newStatus
      });
      Alert.alert('Status Updated', `Incident status set to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err) {
      console.log('Error updating status from chat:', err);
    }
  };

  // Helper for status badge style
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'submitted':
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };
      case 'under_review':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'UNDER REVIEW' };
      case 'dispatched':
        return { bg: '#ECFDF5', text: '#10B981', label: 'DISPATCHED' };
      case 'done':
      case 'resolved':
        return { bg: '#F3F4F6', text: '#4B5563', label: 'RESOLVED' };
      case 'declined':
        return { bg: '#FEF2F2', text: '#EF4444', label: 'DECLINED' };
      default:
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };
    }
  };

  // Render message bubble item
  const renderMessageItem = ({ item, index }) => {
    const isMe = item.senderId === user.uid;
    const timeString = item.createdAt
      ? new Date(item.createdAt.toDate ? item.createdAt.toDate() : item.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '';

    // Date separator logic
    let showDateSeparator = false;
    let dateSeparatorText = '';
    const currentMsgDate = item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt)) : null;

    if (currentMsgDate) {
      if (index === 0) {
        showDateSeparator = true;
      } else {
        const prevMsg = messages[index - 1];
        const prevMsgDate = prevMsg?.createdAt ? (prevMsg.createdAt.toDate ? prevMsg.createdAt.toDate() : new Date(prevMsg.createdAt)) : null;
        if (prevMsgDate) {
          showDateSeparator = currentMsgDate.toDateString() !== prevMsgDate.toDateString();
        }
      }

      if (showDateSeparator) {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (currentMsgDate.toDateString() === today.toDateString()) {
          dateSeparatorText = 'Today';
        } else if (currentMsgDate.toDateString() === yesterday.toDateString()) {
          dateSeparatorText = 'Yesterday';
        } else {
          dateSeparatorText = currentMsgDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          });
        }
      }
    }

    return (
      <View style={{ width: '100%' }}>
        {showDateSeparator && (
          <View style={styles.dateSeparatorContainer}>
            <View style={styles.dateSeparatorLine} />
            <View style={styles.dateSeparatorPill}>
              <Text style={styles.dateSeparatorText}>{dateSeparatorText}</Text>
            </View>
            <View style={styles.dateSeparatorLine} />
          </View>
        )}
        <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
          {!isMe && (
            <View style={styles.senderAvatar}>
              <Text style={styles.senderAvatarText}>
                {item.senderName ? item.senderName.substring(0, 1).toUpperCase() : '?'}
              </Text>
            </View>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
            {!isMe && <Text style={styles.senderNameText}>{item.senderName}</Text>}
            <Text 
              style={[styles.bubbleText, isMe ? styles.bubbleTextRight : styles.bubbleTextLeft]}
              textBreakStrategy="simple"
            >
              {item.text}
              <Text style={{ color: 'transparent' }}>{"  "}</Text>
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
              <Text style={[styles.messageTime, isMe ? styles.messageTimeRight : styles.messageTimeLeft, { marginTop: 0 }]}>
                {timeString}
              </Text>
              {isMe && (
                item.read ? (
                  <View style={{ flexDirection: 'row', marginLeft: 4 }}>
                    <Feather name="check" size={12} color="#93C5FD" />
                    <Feather name="check" size={12} color="#93C5FD" style={{ marginLeft: -8 }} />
                  </View>
                ) : (
                  <Feather name="check" size={12} color="#CBD5E1" style={{ marginLeft: 4 }} />
                )
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderListFooter = () => {
    if (!isOtherTyping) return null;

    const otherName = isAdmin ? citizenProfile?.fullName || activeAlert?.reporterName || 'Citizen' : 'Barangay Support';
    const avatarInitial = otherName.substring(0, 1).toUpperCase();

    return (
      <View style={[styles.messageRow, styles.messageRowLeft, { marginBottom: 16 }]}>
        <View style={styles.senderAvatar}>
          <Text style={styles.senderAvatarText}>{avatarInitial}</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleLeft, styles.typingBubble]}>
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
          <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyWelcomeContainer}>
        <View style={styles.emptyWelcomeCard}>
          <View style={styles.emptyWelcomeIconWrapper}>
            <Feather name="message-square" size={32} color="#0B2564" />
          </View>
          <Text style={styles.emptyWelcomeTitle}>Start the Conversation</Text>
          <Text style={styles.emptyWelcomeDesc}>
            {isAdmin 
              ? "Send a message to coordinate with the citizen regarding this incident report." 
              : "This thread is open for direct coordination with the Barangay Command Center responders."}
          </Text>
        </View>
      </View>
    );
  };

  const activeBadge = activeAlert ? getStatusBadgeStyle(activeAlert.status) : null;
  const currentSerial = activeAlert ? `#INC-${activeAlert.id.substring(0, 3).toUpperCase()}` : '';

  const isIncidentResolved = activeAlert?.status === 'done' || activeAlert?.status === 'resolved';
  const isUnverifiedCitizen = !isAdmin && user && !user.emailVerified;
  const isInputDisabled = isIncidentResolved || isUnverifiedCitizen;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{isAdmin ? citizenProfile?.fullName || userName || 'Citizen Chat' : 'Barangay Support'}</Text>
          <Text style={styles.headerSubtitle}>
            {isAdmin ? 'Responder Mode' : 'Barangay Command Center'}
          </Text>
        </View>

        {/* Multi-Incident Dropdown Toggle for Admin */}
        {isAdmin && userAlerts.length > 1 && (
          <TouchableOpacity
            style={styles.selectorToggleBtn}
            onPress={() => setShowIncidentSelector(!showIncidentSelector)}
            activeOpacity={0.8}
          >
            <Feather
              name={showIncidentSelector ? 'chevron-up' : 'sliders'}
              size={18}
              color="#0B2564"
            />
            <Text style={styles.selectorToggleText}>Incidents ({userAlerts.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Admin Multi-Incident Selector Dropdown Sheet */}
      {isAdmin && showIncidentSelector && userAlerts.length > 1 && (
        <View style={styles.selectorDropdown}>
          <Text style={styles.selectorHeader}>Select Chat Incident Thread:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorScroll}
          >
            {userAlerts.map((alertItem) => {
              const isSelected = alertItem.id === currentAlertId;
              const shortId = `#INC-${alertItem.id.substring(0, 3).toUpperCase()}`;
              return (
                <TouchableOpacity
                  key={alertItem.id}
                  style={[
                    styles.selectorChip,
                    isSelected && styles.selectorChipActive,
                  ]}
                  onPress={() => {
                    setCurrentAlertId(alertItem.id);
                    setShowIncidentSelector(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.selectorChipText,
                      isSelected && styles.selectorChipTextActive,
                    ]}
                  >
                    {shortId} • {alertItem.category}
                  </Text>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          alertItem.status === 'submitted'
                            ? '#D97706'
                            : alertItem.status === 'dispatched'
                            ? '#10B981'
                            : '#9CA3AF',
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Incident Details Context Subheader (Both Citizen and Admin) */}
      {activeAlert && (
        <View style={styles.contextSubheader}>
          <View style={styles.contextLeft}>
            <Feather name="alert-circle" size={14} color="#6B7280" style={{ marginRight: 6 }} />
            <Text style={styles.contextTitle}>
              {currentSerial} • {activeAlert.category}
            </Text>
          </View>
          
          {/* Admin Quick-Status Transition Chips */}
          {isAdmin ? (
            <View style={styles.adminStatusChips}>
              {activeAlert.status !== 'under_review' && activeAlert.status !== 'resolved' && activeAlert.status !== 'done' && (
                <TouchableOpacity 
                  style={[styles.statusChip, { backgroundColor: '#EFF6FF' }]} 
                  onPress={() => handleUpdateStatus('under_review')}
                >
                  <Text style={[styles.statusChipText, { color: '#2563EB' }]}>Review</Text>
                </TouchableOpacity>
              )}
              {activeAlert.status !== 'dispatched' && activeAlert.status !== 'resolved' && activeAlert.status !== 'done' && (
                <TouchableOpacity 
                  style={[styles.statusChip, { backgroundColor: '#ECFDF5' }]} 
                  onPress={() => handleUpdateStatus('dispatched')}
                >
                  <Text style={[styles.statusChipText, { color: '#10B981' }]}>Dispatch</Text>
                </TouchableOpacity>
              )}
              {activeAlert.status !== 'resolved' && activeAlert.status !== 'done' && (
                <TouchableOpacity 
                  style={[styles.statusChip, { backgroundColor: '#F3F4F6' }]} 
                  onPress={() => handleUpdateStatus('resolved')}
                >
                  <Text style={[styles.statusChipText, { color: '#4B5563' }]}>Resolve</Text>
                </TouchableOpacity>
              )}
              {activeBadge && (activeAlert.status === 'resolved' || activeAlert.status === 'done' || activeAlert.status === 'declined') && (
                <View style={[styles.contextBadge, { backgroundColor: activeBadge.bg }]}>
                  <Text style={[styles.contextBadgeText, { color: activeBadge.text }]}>
                    {activeBadge.label}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            activeBadge && (
              <View style={[styles.contextBadge, { backgroundColor: activeBadge.bg }]}>
                <Text style={[styles.contextBadgeText, { color: activeBadge.text }]}>
                  {activeBadge.label}
                </Text>
              </View>
            )
          )}
        </View>
      )}

      {/* Chat Messages Stream */}
      {loading && messages.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color="#0B2564" />
          <Text style={styles.loadingText}>Syncing messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          ListFooterComponent={renderListFooter}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.chatListContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Resolved or Unverified Composer Warning Banners */}
      {isIncidentResolved && (
        <View style={styles.statusBannerResolved}>
          <Feather name="lock" size={14} color="#4B5563" style={{ marginRight: 6 }} />
          <Text style={styles.statusBannerResolvedText}>This incident has been resolved. Chat is now read-only.</Text>
        </View>
      )}
      {isUnverifiedCitizen && !isIncidentResolved && (
        <View style={styles.statusBannerUnverified}>
          <Feather name="alert-triangle" size={14} color="#D97706" style={{ marginRight: 6 }} />
          <Text style={styles.statusBannerUnverifiedText}>Email verification required to send messages.</Text>
        </View>
      )}

      {/* Input Composer Panel */}
      <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
          <TextInput
            style={[styles.input, isInputDisabled && styles.inputDisabled, { paddingRight: inputText.length >= 400 ? 64 : 16 }]}
            placeholder={
              isIncidentResolved 
                ? "Chat is read-only" 
                : isUnverifiedCitizen 
                ? "Verify email to type..." 
                : "Type your message here..."
            }
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={handleTextChange}
            onBlur={() => updateTypingStatus(false)}
            multiline
            maxLength={500}
            editable={!isInputDisabled}
          />
          {inputText.length >= 400 && (
            <Text style={styles.charCounter}>{inputText.length}/500</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isInputDisabled) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isInputDisabled}
          activeOpacity={0.8}
        >
          {isInputDisabled ? (
            <Feather name="lock" size={18} color="#FFFFFF" />
          ) : (
            <Feather name="send" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 64,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 1,
  },
  selectorToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  selectorToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B2564',
    marginLeft: 6,
  },
  selectorDropdown: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  selectorHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  selectorScroll: {
    paddingVertical: 2,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
  },
  selectorChipActive: {
    backgroundColor: '#E2E8F0',
    borderColor: '#0B2564',
  },
  selectorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  selectorChipTextActive: {
    color: '#0B2564',
    fontWeight: '700',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  contextSubheader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  contextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  contextBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  contextBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  chatListContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
    width: '100%',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  senderAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleLeft: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: '#0F2C59',
    borderBottomRightRadius: 4,
  },
  senderNameText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 4,
    paddingBottom: 2,
    includeFontPadding: false,
  },
  bubbleTextLeft: {
    color: '#1F2937',
  },
  bubbleTextRight: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'right',
  },
  messageTimeLeft: {
    color: '#9CA3AF',
  },
  messageTimeRight: {
    color: '#93C5FD',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: '#1F2937',
    maxHeight: 100,
    lineHeight: 18,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F2C59',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    shadowColor: '#0F2C5940',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 14,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    minWidth: 60,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
    marginHorizontal: 3,
  },
  dateSeparatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    width: '100%',
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dateSeparatorPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateSeparatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
  },
  statusBannerResolved: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusBannerResolvedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusBannerUnverified: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FFEDD5',
  },
  statusBannerUnverifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  adminStatusChips: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  charCounter: {
    position: 'absolute',
    right: 12,
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inputDisabled: {
    backgroundColor: '#E5E7EB',
    color: '#9CA3AF',
  },
  emptyWelcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 40,
  },
  emptyWelcomeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.01,
    shadowRadius: 10,
    elevation: 1,
  },
  emptyWelcomeIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyWelcomeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2C59',
    marginBottom: 8,
  },
  emptyWelcomeDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
});
