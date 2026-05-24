import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { removeBackground } from '@/lib/backgroundRemoval';
import { PlushMeshViewer } from '@/components/plush/PlushMeshViewer';
import { detectOutlineFromPngDataUri, type DetectedOutline } from '@/lib/outlineDetection';

export default function HomeScreen() {
  const [cutoutImageUri, setCutoutImageUri] = useState<string | null>(null);
  const [outline, setOutline] = useState<DetectedOutline | null>(null);
  const [isPlushConfirmed, setIsPlushConfirmed] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);

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

    setIsRemovingBackground(true);
    setOutline(null);
    setIsPlushConfirmed(false);

    try {
      const selectedImage = result.assets[0];
      const isTransparentPng = selectedImage.mimeType === 'image/png';

      if (isTransparentPng) {
        const response = await fetch(selectedImage.uri);
        const imageBlob = await response.blob();
        const imageDataUri = await new Promise<string>((resolve, reject) => {
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

        setCutoutImageUri(imageDataUri);
        setOutline(detectOutlineFromPngDataUri(imageDataUri));
        return;
      }

      const cutout = await removeBackground({
        uri: selectedImage.uri,
        fileName: selectedImage.fileName,
        mimeType: selectedImage.mimeType,
      });

      setCutoutImageUri(cutout.cutoutUri);
      setOutline(detectOutlineFromPngDataUri(cutout.cutoutUri));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Could not cut out photo', message);
    } finally {
      setIsRemovingBackground(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {cutoutImageUri && outline ? (
          <View style={styles.previewFrame}>
            <PlushMeshViewer
              key={cutoutImageUri}
              imageUri={cutoutImageUri}
              outline={outline}
              physicsEnabled={isPlushConfirmed}
            />
          </View>
        ) : null}

        {isRemovingBackground ? (
          <View style={styles.loadingPill}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.loadingText}>Cutting out...</Text>
          </View>
        ) : null}
      </View>

      {cutoutImageUri && outline && !isPlushConfirmed && !isRemovingBackground ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm plush"
          onPress={() => setIsPlushConfirmed(true)}
          style={({ pressed }) => [styles.confirmButton, pressed && styles.confirmButtonPressed]}>
          <Text style={styles.confirmButtonText}>Confirm plush</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a new plush"
        disabled={isRemovingBackground}
        onPress={pickImage}
        style={({ pressed }) => [
          styles.newPlushButton,
          pressed && styles.newPlushButtonPressed,
          isRemovingBackground && styles.newPlushButtonDisabled,
        ]}>
        <Text style={styles.plus}>+</Text>
        <Text style={styles.buttonText}>New plush</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFrame: {
    width: '100%',
    height: '100%',
  },
  loadingPill: {
    position: 'absolute',
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
  newPlushButton: {
    position: 'absolute',
    bottom: 52,
    alignSelf: 'center',
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 30, 30, 0.72)',
    paddingHorizontal: 26,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  confirmButton: {
    position: 'absolute',
    bottom: 144,
    alignSelf: 'center',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(30, 30, 30, 0.12)',
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: 'rgba(245, 245, 245, 0.94)',
  },
  confirmButtonText: {
    color: '#1D1D1D',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  newPlushButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: 'rgba(20, 20, 20, 0.78)',
  },
  newPlushButtonDisabled: {
    opacity: 0.65,
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 40,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
