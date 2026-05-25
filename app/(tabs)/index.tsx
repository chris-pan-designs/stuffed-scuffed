import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { removeBackground } from '@/lib/backgroundRemoval';
import { PlushMeshViewer } from '@/components/plush/PlushMeshViewer';
import { detectOutlineFromPngDataUri, type DetectedOutline } from '@/lib/outlineDetection';

type PlushItem = {
  id: string;
  imageUri: string;
  outline: DetectedOutline;
};

const iconStrokeProps = {
  stroke: '#000000',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PhotoLibraryIcon = () => (
  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21.9989 10H21C19.607 10 18.9104 10 18.324 10.0603C12.9031 10.6176 8.61758 14.9031 8.06029 20.324C8.03963 20.5249 8.02605 20.7388 8.01712 20.9893M8.01712 20.9893C6.46784 20.9603 5.51086 20.8529 4.73005 20.455C3.78924 19.9757 3.02433 19.2108 2.54497 18.27C2 17.2004 2 15.8003 2 13V11C2 8.19974 2 6.79961 2.54497 5.73005C3.02433 4.78924 3.78924 4.02433 4.73005 3.54497C5.79961 3 7.19974 3 10 3H14C16.8003 3 18.2004 3 19.27 3.54497C20.2108 4.02433 20.9757 4.78924 21.455 5.73005C21.9309 6.66397 21.9912 7.84993 21.9989 10C22 10.3123 22 10.6449 22 11V13C22 15.8003 22 17.2004 21.455 18.27C20.9757 19.2108 20.2108 19.9757 19.27 20.455C18.2004 21 16.8003 21 14 21H10C9.24401 21 8.59006 21 8.01712 20.9893ZM7.5 9.5C6.94772 9.5 6.5 9.05228 6.5 8.5C6.5 7.94772 6.94772 7.5 7.5 7.5C8.05228 7.5 8.5 7.94772 8.5 8.5C8.5 9.05228 8.05228 9.5 7.5 9.5Z"
      {...iconStrokeProps}
    />
  </Svg>
);

const CameraIcon = () => (
  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2 11C2 8.19974 2 6.79961 2.54497 5.73005C3.02433 4.78924 3.78924 4.02433 4.73005 3.54497C5.79961 3 7.19974 3 10 3H14C16.8003 3 18.2004 3 19.27 3.54497C20.2108 4.02433 20.9757 4.78924 21.455 5.73005C22 6.79961 22 8.19974 22 11V13C22 15.8003 22 17.2004 21.455 18.27C20.9757 19.2108 20.2108 19.9757 19.27 20.455C18.2004 21 16.8003 21 14 21H10C7.19974 21 5.79961 21 4.73005 20.455C3.78924 19.9757 3.02433 19.2108 2.54497 18.27C2 17.2004 2 15.8003 2 13V11Z"
      {...iconStrokeProps}
    />
    <Path
      d="M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"
      {...iconStrokeProps}
    />
  </Svg>
);

const ResetIcon = () => (
  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.21458 7.86607C8.02543 7.72281 6.85852 7.43772 5.73864 7.01746C5.70724 7.00568 5.67589 6.9938 5.64457 6.9818C5.38094 6.88085 5.11717 6.73098 5.16601 6.39629C5.35304 5.11461 5.70537 3.86202 6.21458 2.66992M5.73864 7.01746C7.20439 5.17853 9.46355 4 11.998 4C16.4162 4 19.998 7.58172 19.998 12C19.998 16.4183 16.4162 20 11.998 20C8.27029 20 5.13809 17.4505 4.25 14"
      {...iconStrokeProps}
    />
  </Svg>
);

const discoGif = require('@/assets/disco.gif');
const sparklesGif = require('@/assets/sparkles.gif');

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const trashButtonRef = useRef<View>(null);
  const trashBoundsRef = useRef<LayoutRectangle | null>(null);
  const [plushes, setPlushes] = useState<PlushItem[]>([]);
  const [isHoldingPlush, setIsHoldingPlush] = useState(false);
  const [isPartyMode, setIsPartyMode] = useState(false);
  const [isPartyVisualVisible, setIsPartyVisualVisible] = useState(false);
  const [partyPulseKey, setPartyPulseKey] = useState(0);
  const [isPreparingPlush, setIsPreparingPlush] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const partyTransition = useRef(new Animated.Value(0)).current;
  const partyGradientMotion = useRef(new Animated.Value(0)).current;
  const isWorking = isPreparingPlush || isRemovingBackground;

  useEffect(() => {
    if (isPartyMode) {
      setIsPartyVisualVisible(true);
      Animated.timing(partyTransition, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(partyTransition, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsPartyVisualVisible(false);
      }
    });
  }, [isPartyMode, partyTransition]);

  useEffect(() => {
    if (!isPartyVisualVisible) {
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(partyGradientMotion, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(partyGradientMotion, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [isPartyVisualVisible, partyGradientMotion]);

  useEffect(() => {
    if (!isPartyMode) {
      return;
    }

    setPartyPulseKey((currentPulseKey) => currentPulseKey + 1);
    const partyInterval = setInterval(() => {
      setPartyPulseKey((currentPulseKey) => currentPulseKey + 1);
    }, 1000);

    return () => clearInterval(partyInterval);
  }, [isPartyMode]);

  const addPlush = (imageUri: string) => {
    setIsPreparingPlush(true);

    requestAnimationFrame(() => {
      setPlushes((currentPlushes) => [
        ...currentPlushes,
        {
          id: `${Date.now()}-${currentPlushes.length}`,
          imageUri,
          outline: detectOutlineFromPngDataUri(imageUri),
        },
      ]);
    });
  };

  const readImageAsDataUri = async (uri: string) => {
    const response = await fetch(uri);
    const imageBlob = await response.blob();

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Could not read the selected PNG.'));
      };

      reader.onerror = () => reject(new Error('Could not read the selected PNG.'));
      reader.readAsDataURL(imageBlob);
    });
  };

  const createPlushFromImage = async (selectedImage: ImagePicker.ImagePickerAsset) => {
    setIsRemovingBackground(true);

    try {
      const isTransparentPng = selectedImage.mimeType === 'image/png';

      if (isTransparentPng) {
        addPlush(await readImageAsDataUri(selectedImage.uri));
        return;
      }

      const cutout = await removeBackground({
        uri: selectedImage.uri,
        fileName: selectedImage.fileName,
        mimeType: selectedImage.mimeType,
      });

      addPlush(cutout.cutoutUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Could not cut out photo', message);
    } finally {
      setIsRemovingBackground(false);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to make a new plush.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    await createPlushFromImage(result.assets[0]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to make a new plush.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    await createPlushFromImage(result.assets[0]);
  };

  const measureTrashButton = () => {
    trashButtonRef.current?.measureInWindow((x, y, width, height) => {
      trashBoundsRef.current = { x, y, width, height };
    });
  };

  const handlePlushDrop = (plushId: string, point: { x: number; y: number }) => {
    const bounds = trashBoundsRef.current;

    if (
      !bounds ||
      point.x < bounds.x ||
      point.x > bounds.x + bounds.width ||
      point.y < bounds.y ||
      point.y > bounds.y + bounds.height
    ) {
      return;
    }

    setPlushes((currentPlushes) => currentPlushes.filter((plush) => plush.id !== plushId));
  };

  const resetPlushes = () => {
    setPlushes([]);
    setIsHoldingPlush(false);
    setIsPreparingPlush(false);
    setIsPartyMode(false);
  };

  const discoTranslateY = partyTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 0],
  });
  const gradientTranslateX = partyGradientMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 70],
  });
  const gradientTranslateY = partyGradientMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 45],
  });
  const screenBackgroundColor = partyTransition.interpolate({
    inputRange: [0, 1],
    outputRange: ['#101010', '#1A1A1A'],
  });

  return (
    <Animated.View style={[styles.screen, { backgroundColor: screenBackgroundColor, paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        {isPartyVisualVisible ? (
          <Animated.View pointerEvents="none" style={[styles.partyBackdrop, { opacity: partyTransition }]}>
            <Animated.View
              style={[
                styles.partyGradientWash,
                {
                  transform: [
                    { translateX: gradientTranslateX },
                    { translateY: gradientTranslateY },
                  ],
                },
              ]}>
              <LinearGradient
                colors={['#1A1A1A', '#262626', '#3A3A3A', '#232323', '#1A1A1A']}
                end={{ x: 1, y: 1 }}
                locations={[0, 0.28, 0.52, 0.76, 1]}
                start={{ x: 0, y: 0 }}
                style={styles.partyGradient}
              />
            </Animated.View>
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.34)']}
              locations={[0, 0.46, 1]}
              style={styles.partyVignette}
            />
          </Animated.View>
        ) : null}

        {plushes.length > 0 ? (
          <View style={styles.previewFrame}>
            <PlushMeshViewer
              onPlushDragChange={setIsHoldingPlush}
              onPlushDrop={handlePlushDrop}
              partyPulseKey={partyPulseKey}
              plushes={plushes}
              physicsEnabled
              onPlushesPrepared={() => setIsPreparingPlush(false)}
            />
          </View>
        ) : null}

        {isPartyVisualVisible ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.sparklesOverlay, { opacity: partyTransition }]}>
              <Image source={sparklesGif} style={styles.sparklesImage} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.discoOverlay, { opacity: partyTransition, transform: [{ translateY: discoTranslateY }] }]}>
              <Image source={discoGif} style={styles.discoImage} />
            </Animated.View>
          </>
        ) : null}

        {isHoldingPlush ? (
          <View
            ref={trashButtonRef}
            onLayout={measureTrashButton}
            style={[styles.trashButton, { top: 29, right: 28 }]}>
            <Ionicons name="trash-outline" size={29} color="#FFFFFF" />
          </View>
        ) : null}

        {isWorking ? (
          <View style={styles.loadingPill}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.loadingText}>{isRemovingBackground ? 'Cutting out...' : 'Preparing plush...'}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <View style={styles.leftActionFrame}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose photo"
            disabled={isWorking}
            onPress={pickImage}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed, isWorking && styles.iconButtonDisabled]}>
            <PhotoLibraryIcon />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            disabled={isWorking}
            onPress={takePhoto}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed, isWorking && styles.iconButtonDisabled]}>
            <CameraIcon />
          </Pressable>
        </View>

        <View style={styles.rightActionFrame}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPartyMode ? 'Stop party' : 'Start party'}
            disabled={isWorking || plushes.length === 0}
            onPress={() => setIsPartyMode((currentValue) => !currentValue)}
            style={({ pressed }) => [
              styles.iconButton,
              isPartyMode && styles.partyButtonActive,
              pressed && styles.iconButtonPressed,
              (isWorking || plushes.length === 0) && styles.iconButtonDisabled,
            ]}>
            <Ionicons name="sparkles-outline" size={32} color="#000000" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset plushies"
            disabled={isWorking || plushes.length === 0}
            onPress={resetPlushes}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.iconButtonPressed,
              (isWorking || plushes.length === 0) && styles.iconButtonDisabled,
            ]}>
            <ResetIcon />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#101010',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  previewFrame: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  partyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: '#1A1A1A',
  },
  partyGradientWash: {
    position: 'absolute',
    top: -260,
    right: -260,
    bottom: -260,
    left: -260,
    opacity: 0.52,
  },
  partyGradient: {
    flex: 1,
  },
  partyVignette: {
    ...StyleSheet.absoluteFillObject,
  },
  sparklesOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  sparklesImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  discoOverlay: {
    position: 'absolute',
    zIndex: 3,
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  discoImage: {
    width: 180,
    height: 180,
    resizeMode: 'contain',
  },
  trashButton: {
    position: 'absolute',
    zIndex: 4,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 35,
    backgroundColor: '#FF4650',
  },
  loadingPill: {
    position: 'absolute',
    zIndex: 4,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 30, 30, 0.72)',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 16,
  },
  leftActionFrame: {
    flexDirection: 'row',
    gap: 12,
  },
  rightActionFrame: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: '#F0F0F0',
  },
  partyButtonActive: {
    backgroundColor: '#FFE76A',
  },
  iconButtonDisabled: {
    opacity: 0.42,
  },
});
