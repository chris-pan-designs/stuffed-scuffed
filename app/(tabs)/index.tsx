import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { removeBackground } from '@/lib/backgroundRemoval';
import { PlushMeshViewer } from '@/components/plush/PlushMeshViewer';
import { detectOutlineFromPngDataUri, type DetectedOutline } from '@/lib/outlineDetection';

type PlushItem = {
  id: string;
  imageUri: string;
  name: string;
  outline: DetectedOutline;
};

type DockButtonTone = {
  background: string;
  border: string;
  outerBackground: string;
  primary: string;
};

const DOCK_TONES = {
  library: {
    background: '#F9DDF1',
    border: '#E8A1DD',
    outerBackground: '#FBF5EF',
    primary: '#B22683',
  },
  camera: {
    background: '#E3F0F8',
    border: '#7CBCEB',
    outerBackground: '#FBF5EF',
    primary: '#2865B8',
  },
  party: {
    background: '#E8DDFC',
    border: '#B89CF0',
    outerBackground: '#FBF5EF',
    primary: '#5D35A7',
  },
  reset: {
    background: '#E8F2EC',
    border: '#9ACBC2',
    outerBackground: '#FBF5EF',
    primary: '#1F6762',
  },
} satisfies Record<string, DockButtonTone>;

const DARK_DOCK_TONES = {
  library: {
    background: '#3A2028',
    border: '#8E3E55',
    outerBackground: '#1F1F1F',
    primary: '#FFB3C8',
  },
  camera: {
    background: '#1C2A38',
    border: '#416D95',
    outerBackground: '#1F1F1F',
    primary: '#A9D8FF',
  },
  party: {
    background: '#2B2240',
    border: '#7256A8',
    outerBackground: '#1F1F1F',
    primary: '#D8C4FF',
  },
  reset: {
    background: '#1D312E',
    border: '#4A7E77',
    outerBackground: '#1F1F1F',
    primary: '#A9DED5',
  },
} satisfies Record<string, DockButtonTone>;

const FOCUS_DOCK_TONES = {
  back: {
    background: '#F9DDF1',
    border: '#E8A1DD',
    outerBackground: '#FBF5EF',
    primary: '#B22683',
  },
  edit: {
    background: '#FFF4E8',
    border: '#F0B46B',
    outerBackground: '#FBF5EF',
    primary: '#C8741D',
  },
  delete: {
    background: '#FFE6EA',
    border: '#F3A5AD',
    outerBackground: '#FBF5EF',
    primary: '#BF2C4D',
  },
  pet: {
    background: '#DCF7F7',
    border: '#73DCE3',
    outerBackground: '#FBF5EF',
    primary: '#28ACB8',
  },
} satisfies Record<string, DockButtonTone>;

const PhotoLibraryIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M9.95624 2C8.5932 1.99999 7.50917 1.99999 6.63458 2.07144C5.73898 2.14462 4.9753 2.29768 4.27606 2.65396C3.14708 3.2292 2.2292 4.14708 1.65396 5.27606C1.29768 5.9753 1.14462 6.73898 1.07144 7.63458C0.999986 8.50917 0.999992 9.5932 1 10.9562V13.0438C0.999992 14.4068 0.999986 15.4908 1.07144 16.3654C1.14462 17.261 1.29768 18.0247 1.65396 18.7239C2.2292 19.8529 3.14709 20.7708 4.27606 21.346C5.28355 21.8594 6.45408 21.9602 7.99841 21.9891C8.58072 22 9.24244 22 9.99256 22H14.0438C15.4068 22 16.4909 22 17.3654 21.9286C18.261 21.8554 19.0247 21.7023 19.7239 21.346C20.8529 20.7708 21.7708 19.8529 22.346 18.7239C22.7023 18.0247 22.8554 17.261 22.9286 16.3654C23 15.4909 23 14.4069 23 13.0439V11C23 10.6453 23 10.3108 22.9989 9.99644C22.9915 7.90993 22.9508 6.46297 22.346 5.27606C21.7708 4.14709 20.8529 3.2292 19.7239 2.65396C19.0247 2.29768 18.261 2.14462 17.3654 2.07144C16.4908 1.99999 15.4068 1.99999 14.0438 2H9.95624Z"
      fill={color}
    />
    <Path
      d="M20.9929 9.25H20.9392C19.6035 9.24999 18.8722 9.24998 18.2473 9.31422C12.566 9.89828 8.05542 14.3266 7.34604 19.9688C8.04013 19.9995 8.89374 20 10 20H14C15.4166 20 16.419 19.9992 17.2026 19.9352C17.9745 19.8721 18.4457 19.7527 18.816 19.564C19.5686 19.1805 20.1805 18.5686 20.564 17.816C20.7527 17.4457 20.8721 16.9745 20.9352 16.2026C20.9992 15.419 21 14.4166 21 13V11C21 10.3312 20.9998 9.75471 20.9929 9.25ZM7.5 6.5C6.39543 6.5 5.5 7.39543 5.5 8.5C5.5 9.60457 6.39543 10.5 7.5 10.5C8.60457 10.5 9.5 9.60457 9.5 8.5C9.5 7.39543 8.60457 6.5 7.5 6.5Z"
      fill={color}
    />
  </Svg>
);

const CameraIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M9.95624 2C8.5932 1.99999 7.50917 1.99999 6.63458 2.07144C5.73898 2.14462 4.9753 2.29768 4.27606 2.65396C3.14708 3.2292 2.2292 4.14708 1.65396 5.27606C1.29768 5.9753 1.14462 6.73898 1.07144 7.63458C0.999986 8.50917 0.999992 9.5932 1 10.9562V13.0438C0.999992 14.4068 0.999986 15.4908 1.07144 16.3654C1.14462 17.261 1.29768 18.0247 1.65396 18.7239C2.2292 19.8529 3.14709 20.7708 4.27606 21.346C4.9753 21.7023 5.73898 21.8554 6.63458 21.9286C7.50914 22 8.59313 22 9.95613 22H14.0438C15.4068 22 16.4909 22 17.3654 21.9286C18.261 21.8554 19.0247 21.7023 19.7239 21.346C20.8529 20.7708 21.7708 19.8529 22.346 18.7239C22.7023 18.0247 22.8554 17.261 22.9286 16.3654C23 15.4909 23 14.4069 23 13.0439V10.9562C23 9.59322 23 8.50914 22.9286 7.63458C22.8554 6.73898 22.7023 5.9753 22.346 5.27606C21.7708 4.14709 20.8529 3.2292 19.7239 2.65396C19.0247 2.29768 18.261 2.14462 17.3654 2.07144C16.4908 1.99999 15.4068 1.99999 14.0438 2H9.95624Z"
      fill={color}
    />
    <Path
      d="M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </Svg>
);

const PartyIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M10.2427 1.36917C9.89427 0.940653 9.26444 0.875723 8.83593 1.22414C8.40742 1.57256 8.34249 2.20239 8.69091 2.6309C9.73103 3.91013 10.0674 5.63406 9.55083 7.1838C9.37618 7.70775 9.65934 8.27407 10.1833 8.44872C10.7072 8.62336 11.2735 8.3402 11.4482 7.81626C12.1888 5.59451 11.6988 3.16001 10.2427 1.36917Z"
      fill={color}
    />
    <Path
      opacity={0.28}
      d="M6.71057 9.13889C7.11713 9.51269 7.1437 10.1453 6.7699 10.5519C6.72516 10.6005 6.6037 10.7692 6.41405 11.1071C6.39821 11.1354 6.38214 11.1643 6.36585 11.194C6.84196 12.2741 7.80453 13.6192 9.09239 14.907C10.3797 16.1943 11.7241 17.1566 12.804 17.6329C12.8332 17.6169 12.8618 17.6011 12.8897 17.5856C13.2308 17.395 13.3998 17.2734 13.4475 17.2295C13.8541 16.8557 14.4867 16.8823 14.8605 17.2888C15.2343 17.6954 15.2078 18.328 14.8012 18.7018C14.5677 18.9165 14.2196 19.1335 13.8652 19.3315C13.4887 19.5419 13.0276 19.7729 12.5148 20.0095C11.4888 20.4831 10.2204 20.9954 8.94095 21.4267C7.66915 21.8554 6.34656 22.2176 5.22311 22.371C4.6638 22.4474 4.10996 22.4785 3.61628 22.4211C3.14508 22.3662 2.57468 22.2133 2.15839 21.7784C1.75178 21.3536 1.61165 20.7896 1.56356 20.3189C1.51316 19.8256 1.54805 19.2736 1.62747 18.7148C1.78688 17.593 2.15082 16.278 2.57988 15.0144C3.0114 13.7435 3.52216 12.4858 3.99409 11.4682C4.22993 10.9596 4.46013 10.5022 4.66991 10.1284C4.86756 9.77617 5.08378 9.43079 5.2976 9.19822C5.6714 8.79165 6.30401 8.76509 6.71057 9.13889Z"
      fill={color}
    />
    <Path
      d="M12.9998 4C12.9998 3.44772 13.4475 3 13.9998 3H14.0098C14.562 3 15.0098 3.44772 15.0098 4C15.0098 4.55228 14.562 5 14.0098 5H13.9998C13.4475 5 12.9998 4.55228 12.9998 4Z"
      fill={color}
    />
    <Path
      d="M22.9584 4.06218C23.1172 4.59115 22.8171 5.14866 22.2881 5.30741C19.064 6.27496 16.2896 7.94737 14.2999 10.6004C13.9685 11.0422 13.3417 11.1318 12.8999 10.8004C12.458 10.469 12.3685 9.84221 12.6999 9.40038C15.002 6.3308 18.1791 4.45239 21.7132 3.39181C22.2422 3.23306 22.7997 3.5332 22.9584 4.06218Z"
      fill={color}
    />
    <Path
      d="M8.95425 8.59887C10.0976 9.17055 11.4019 10.1456 12.6284 11.372C13.8548 12.5984 14.8298 13.9027 15.4015 15.0461C15.6848 15.6128 15.8955 16.1921 15.9598 16.7344C16.0224 17.2624 15.9616 17.9383 15.4568 18.443C15.0731 18.8267 14.5828 18.9548 14.1503 18.9658C13.2948 18.9876 12.304 18.5686 11.3853 18.015C10.4236 17.4355 9.38156 16.6105 8.38572 15.6146C7.38988 14.6188 6.56482 13.5767 5.9853 12.615C5.43174 11.6964 5.01272 10.7056 5.03451 9.85004C5.04553 9.41754 5.17365 8.92719 5.55729 8.54355C6.06208 8.03876 6.73798 7.97796 7.26597 8.04054C7.80821 8.1048 8.3875 8.31549 8.95425 8.59887Z"
      fill={color}
    />
    <Path d="M17 19C17 18.4477 17.4477 18 18 18H18.01C18.5623 18 19.01 18.4477 19.01 19C19.01 19.5523 18.5623 20 18.01 20H18C17.4477 20 17 19.5523 17 19Z" fill={color} />
    <Path d="M6 4C5.44772 4 5 4.44772 5 5C5 5.55228 5.44772 6 6 6H6.01C6.56228 6 7.01 5.55228 7.01 5C7.01 4.44772 6.56228 4 6.01 4H6Z" fill={color} />
    <Path d="M21 9C20.4477 9 20 9.44772 20 10C20 10.5523 20.4477 11 21 11H21.01C21.5623 11 22.01 10.5523 22.01 10C22.01 9.44772 21.5623 9 21.01 9H21Z" fill={color} />
  </Svg>
);

const ResetIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.21458 7.86607C8.02543 7.72281 6.85852 7.43772 5.73864 7.01746C5.70724 7.00568 5.67589 6.9938 5.64457 6.9818C5.38094 6.88085 5.11717 6.73098 5.16601 6.39629C5.35304 5.11461 5.70537 3.86202 6.21458 2.66992M5.73864 7.01746C7.20439 5.17853 9.46355 4 11.998 4C16.4162 4 19.998 7.58172 19.998 12C19.998 16.4183 16.4162 20 11.998 20C8.27029 20 5.13809 17.4505 4.25 14"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
    />
  </Svg>
);

const BackIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M8.03089 3.91602C6.57669 4.97466 5.2706 6.21138 4.14485 7.59488C4.04828 7.71356 4 7.85646 4 7.99935M8.03089 12.0827C6.57669 11.024 5.2706 9.78732 4.14485 8.40382C4.04828 8.28513 4 8.14224 4 7.99935M4 7.99935H15C17.7614 7.99935 20 10.2379 20 12.9993C20 15.7608 17.7614 17.9993 15 17.9993H12"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </Svg>
);

const EditIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M13 21H21"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
    <Path
      d="M19.3694 2.41141C18.3496 1.7525 17.0102 1.89744 16.154 2.75744L3.05189 15.917C2.83564 16.1336 2.62424 16.3454 2.46567 16.601C2.32684 16.8248 2.22287 17.0684 2.15724 17.3234C2.08231 17.6145 2.07531 17.9137 2.06813 18.2205L2.0003 20.9709C1.99366 21.24 2.09582 21.5004 2.28367 21.6933C2.47151 21.8861 2.72919 21.9951 2.9984 21.9955L5.79769 22.0001C6.11408 22.001 6.42451 22.0019 6.72739 21.9292C6.99253 21.8656 7.24588 21.7604 7.47811 21.6176C7.74324 21.4546 7.96201 21.2343 8.18547 21.0093L21.2101 7.92735C22.0392 7.09458 22.2777 5.76573 21.609 4.68846C21.042 3.77496 20.2689 2.99261 19.3694 2.41141Z"
      fill={color}
    />
  </Svg>
);

const DeleteIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M6 5C5.44772 5 5 5.44772 5 6V15.0355C4.99999 15.9373 4.99999 16.6647 5.04038 17.2567C5.08191 17.8654 5.16948 18.4037 5.3806 18.9134C5.88807 20.1386 6.86144 21.1119 8.08658 21.6194C8.59628 21.8305 9.13456 21.9181 9.74331 21.9596C10.3353 22 11.0627 22 11.9645 22H12.0355C12.9373 22 13.6647 22 14.2567 21.9596C14.8654 21.9181 15.4037 21.8305 15.9134 21.6194C17.1386 21.1119 18.1119 20.1386 18.6194 18.9134C18.8305 18.4037 18.9181 17.8654 18.9596 17.2567C19 16.6647 19 15.9373 19 15.0355V6C19 5.44772 18.5523 5 18 5H6Z"
      fill={color}
    />
    <Path
      d="M16 6L14.8944 3.78885C14.3463 2.69253 13.2257 2 12 2C10.7743 2 9.65374 2.69253 9.10557 3.78885L8 6M16 6H4M16 6H20"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </Svg>
);

const PetIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      opacity={0.28}
      d="M15.4234 12.9997H19.8945C21.2581 12.9997 23.3623 11.3126 21.8448 10.0028C17.4998 5.99971 10.4998 5.99971 5.99985 10.0864M15.4234 12.9997C15.5518 12.8434 15.664 12.6715 15.7568 12.4859C16.0982 11.8031 15.6016 10.9997 14.8382 10.9997H9.99985M15.4234 12.9997C14.9099 13.6247 14.1371 13.9997 13.3074 13.9997H12.1851C12.0633 13.9997 11.9431 14.0281 11.8341 14.0826C10.0283 14.9855 8.00072 15.3464 5.99609 15.1233C5.99858 15.0824 5.99985 15.0412 5.99985 14.9997V10.0864M5.99985 10.0864V9.99971"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
    <Path
      d="M1 15C1 16.6569 2.34315 18 4 18C5.65685 18 7 16.6569 7 15V10C7 8.34315 5.65685 7 4 7C2.34315 7 1 8.34315 1 10V15Z"
      fill={color}
    />
  </Svg>
);

const discoGif = require('@/assets/party mode assets/disco.gif');
const pettingGif = require('@/assets/petting.gif');
const sparklesGif = require('@/assets/party mode assets/sparkles.gif');
const PETTING_GIF_LOOP_MS = 350;
const PETTING_GIF_PLAY_COUNT = 3;
const PETTING_GIF_VISIBLE_MS = PETTING_GIF_LOOP_MS * PETTING_GIF_PLAY_COUNT;
const PETTING_OVERLAY_WIDTH = 116;
const PETTING_OVERLAY_TOP_OFFSET = 38;

type ActionButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  fontFamily?: string;
  icon: (color: string) => ReactNode;
  label: string;
  onPress: () => void;
  tone: DockButtonTone;
};

const ActionButton = ({ accessibilityLabel, disabled, fontFamily, icon, label, onPress, tone }: ActionButtonProps) => (
  <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.actionButtonOuter,
      { backgroundColor: tone.outerBackground },
      pressed && !disabled && styles.actionButtonPressed,
      disabled && styles.actionButtonDisabled,
    ]}>
    <View style={[styles.actionButtonInner, { backgroundColor: tone.background }]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Rect
          x={1}
          y={1}
          width={72}
          height={59}
          rx={18}
          ry={18}
          fill="none"
          stroke={tone.border}
          strokeDasharray="6 6"
          strokeLinecap="butt"
          strokeWidth={2}
        />
      </Svg>
      {icon(tone.primary)}
      <Text style={[styles.actionButtonLabel, { color: tone.primary, fontFamily }]}>{label}</Text>
    </View>
  </Pressable>
);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ PlusJakartaSans_600SemiBold });
  const dockLabelFontFamily = fontsLoaded ? 'PlusJakartaSans_600SemiBold' : undefined;
  const trashButtonRef = useRef<View>(null);
  const trashBoundsRef = useRef<LayoutRectangle | null>(null);
  const [plushes, setPlushes] = useState<PlushItem[]>([]);
  const [isHoldingPlush, setIsHoldingPlush] = useState(false);
  const [isPartyMode, setIsPartyMode] = useState(false);
  const [isPartyVisualVisible, setIsPartyVisualVisible] = useState(false);
  const [partyPulseKey, setPartyPulseKey] = useState(0);
  const [isPreparingPlush, setIsPreparingPlush] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });
  const [nameTagSize, setNameTagSize] = useState({ width: 0, height: 0 });
  const [focusedPlushId, setFocusedPlushId] = useState<string | null>(null);
  const [isPetting, setIsPetting] = useState(false);
  const [petPulseKey, setPetPulseKey] = useState(0);
  const partyTransition = useRef(new Animated.Value(0)).current;
  const partyChromeTransition = useRef(new Animated.Value(0)).current;
  const partyGradientMotion = useRef(new Animated.Value(0)).current;
  const focusModeTransition = useRef(new Animated.Value(0)).current;
  const petTransition = useRef(new Animated.Value(0)).current;
  const pettingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameTagPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const petPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isWorking = isPreparingPlush || isRemovingBackground;
  const focusedPlush = plushes.find((plush) => plush.id === focusedPlushId);

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
    Animated.timing(partyChromeTransition, {
      toValue: isPartyMode ? 1 : 0,
      duration: isPartyMode ? 1100 : 320,
      easing: isPartyMode ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isPartyMode, partyChromeTransition]);

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

  useEffect(() => {
    if (focusedPlushId && !plushes.some((plush) => plush.id === focusedPlushId)) {
      setFocusedPlushId(null);
    }
  }, [focusedPlushId, plushes]);

  useEffect(() => {
    Animated.timing(focusModeTransition, {
      toValue: focusedPlush ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focusedPlush, focusModeTransition]);

  useEffect(() => {
    Animated.timing(petTransition, {
      toValue: isPetting ? 1 : 0,
      duration: isPetting ? 120 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isPetting, petTransition]);

  useEffect(
    () => () => {
      if (pettingTimeoutRef.current) {
        clearTimeout(pettingTimeoutRef.current);
      }
    },
    []
  );

  const addPlush = (imageUri: string) => {
    setIsPreparingPlush(true);

    requestAnimationFrame(() => {
      setPlushes((currentPlushes) => [
        ...currentPlushes,
        {
          id: `${Date.now()}-${currentPlushes.length}`,
          imageUri,
          name: `plush ${currentPlushes.length + 1}`,
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
    setFocusedPlushId(null);
    setIsPetting(false);
    setIsHoldingPlush(false);
    setIsPreparingPlush(false);
    setIsPartyMode(false);
  };

  const focusPlush = (plushId: string) => {
    setIsPartyMode(false);
    setIsPetting(false);
    setIsHoldingPlush(false);
    setFocusedPlushId(plushId);
  };

  const petFocusedPlush = () => {
    if (!focusedPlush) {
      return;
    }

    if (pettingTimeoutRef.current) {
      clearTimeout(pettingTimeoutRef.current);
    }

    setIsPetting(true);
    setPetPulseKey((currentKey) => currentKey + 1);
    pettingTimeoutRef.current = setTimeout(() => {
      setIsPetting(false);
      pettingTimeoutRef.current = null;
    }, PETTING_GIF_VISIBLE_MS);
  };

  const editFocusedPlushName = () => {
    if (!focusedPlush) {
      return;
    }

    Alert.prompt(
      'Edit plush name',
      undefined,
      (nextName) => {
        const trimmedName = nextName.trim();

        if (!trimmedName) {
          return;
        }

        setPlushes((currentPlushes) =>
          currentPlushes.map((plush) =>
            plush.id === focusedPlush.id ? { ...plush, name: trimmedName } : plush
          )
        );
      },
      'plain-text',
      focusedPlush.name
    );
  };

  const deleteFocusedPlush = () => {
    if (!focusedPlush) {
      return;
    }

    setPlushes((currentPlushes) => currentPlushes.filter((plush) => plush.id !== focusedPlush.id));
    setIsPetting(false);
    setFocusedPlushId(null);
  };

  const handlePlayAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setPlayAreaSize((currentSize) => {
      if (currentSize.width === width && currentSize.height === height) {
        return currentSize;
      }

      return { width, height };
    });
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
  const screenBackgroundColor = partyChromeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FCF1E9', '#000000'],
  });
  const dockTones = isPartyMode ? DARK_DOCK_TONES : DOCK_TONES;
  const normalDockOpacity = focusModeTransition.interpolate({
    inputRange: [0, 0.45, 0.55, 1],
    outputRange: [1, 0, 0, 0],
  });
  const normalDockTranslateY = focusModeTransition.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 8, 8],
  });
  const focusDockOpacity = focusModeTransition.interpolate({
    inputRange: [0, 0.45, 0.55, 1],
    outputRange: [0, 0, 0, 1],
  });
  const focusDockTranslateY = focusModeTransition.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [8, 8, 0],
  });
  const petOpacity = petTransition;
  const nameTagOpacity = Animated.multiply(
    focusModeTransition,
    petTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    })
  );
  const petScale = petTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Animated.View style={[styles.screen, { backgroundColor: screenBackgroundColor, paddingTop: insets.top + 16 }]}>
      <StatusBar style={isPartyMode || isPartyVisualVisible ? 'light' : 'dark'} />
      <View style={[styles.playAreaOuter, isPartyMode && styles.playAreaOuterParty]}>
        <View style={styles.playAreaInner} onLayout={handlePlayAreaLayout}>
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
              backgroundColor="#FCF1E9"
              focusedPlushId={focusedPlushId}
              onFocusedPlushLayout={(layout) => {
                petPosition.setValue({
                  x: layout.petX - PETTING_OVERLAY_WIDTH / 2,
                  y: layout.petY - PETTING_OVERLAY_TOP_OFFSET,
                });
                nameTagPosition.setValue({
                  x: layout.x - playAreaSize.width / 2,
                  y: layout.y - nameTagSize.height - 40,
                });
              }}
              onEmptyPress={() => setFocusedPlushId(null)}
              onPlushDragChange={setIsHoldingPlush}
              onPlushDrop={handlePlushDrop}
              onPlushPress={focusPlush}
              partyPulseKey={partyPulseKey}
              petPulseKey={petPulseKey}
              plushes={plushes}
              physicsEnabled={!focusedPlushId}
              onPlushesPrepared={() => setIsPreparingPlush(false)}
            />
          </View>
        ) : null}

        {focusedPlush ? (
          <Animated.View
            pointerEvents="none"
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;

              setNameTagSize((currentSize) => {
                if (currentSize.width === width && currentSize.height === height) {
                  return currentSize;
                }

                return { width, height };
              });
            }}
            style={[
              styles.nameTag,
              {
                opacity: nameTagOpacity,
                transform: [
                  { translateX: nameTagPosition.x },
                  { translateY: nameTagPosition.y },
                ],
              },
            ]}>
            <Text style={[styles.nameTagText, { fontFamily: dockLabelFontFamily }]}>{focusedPlush.name}</Text>
          </Animated.View>
        ) : null}

        {focusedPlush && isPetting ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pettingOverlay,
              {
                opacity: petOpacity,
                top: 0,
                transform: [
                  { translateX: petPosition.x },
                  { translateY: petPosition.y },
                  { scale: petScale },
                ],
              },
            ]}>
            <Image key={petPulseKey} source={pettingGif} style={styles.pettingImage} />
          </Animated.View>
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
            style={[styles.trashButton, { top: 20, right: 20 }]}>
            <Ionicons name="trash-outline" size={29} color="#FFFFFF" />
          </View>
        ) : null}

        {playAreaSize.width > 0 && playAreaSize.height > 0 && !isPartyMode ? (
          <View pointerEvents="none" style={styles.playAreaDashOverlay}>
            <Svg width={playAreaSize.width} height={playAreaSize.height}>
              <Rect
                x={1}
                y={1}
                width={Math.max(playAreaSize.width - 2, 0)}
                height={Math.max(playAreaSize.height - 2, 0)}
                rx={20}
                ry={20}
                fill="none"
                stroke="#D9A4DC"
                strokeDasharray="12 10"
                strokeLinecap="butt"
                strokeWidth={2}
              />
            </Svg>
          </View>
        ) : null}

        {isWorking ? (
          <View style={styles.loadingPill}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.loadingText}>{isRemovingBackground ? 'Cutting out...' : 'Preparing plush...'}</Text>
          </View>
        ) : null}
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <View style={styles.bottomButtonStage}>
          <Animated.View
            pointerEvents={focusedPlush ? 'none' : 'auto'}
            style={[
              styles.bottomButtonRow,
              styles.bottomButtonLayer,
              { opacity: normalDockOpacity, transform: [{ translateY: normalDockTranslateY }] },
            ]}>
            <ActionButton
              accessibilityLabel="Choose photo"
              disabled={isWorking}
              fontFamily={dockLabelFontFamily}
              icon={(color) => <PhotoLibraryIcon color={color} />}
              label="Library"
              onPress={pickImage}
              tone={dockTones.library}
            />

            <ActionButton
              accessibilityLabel="Take photo"
              disabled={isWorking}
              fontFamily={dockLabelFontFamily}
              icon={(color) => <CameraIcon color={color} />}
              label="Camera"
              onPress={takePhoto}
              tone={dockTones.camera}
            />

            <ActionButton
              accessibilityLabel={isPartyMode ? 'Stop party' : 'Start party'}
              disabled={isWorking || plushes.length === 0}
              fontFamily={dockLabelFontFamily}
              icon={(color) => <PartyIcon color={color} />}
              label="Party"
              onPress={() => setIsPartyMode((currentValue) => !currentValue)}
              tone={dockTones.party}
            />

            <ActionButton
              accessibilityLabel="Reset plushies"
              disabled={isWorking || plushes.length === 0}
              fontFamily={dockLabelFontFamily}
              icon={(color) => <ResetIcon color={color} />}
              label="Reset"
              onPress={resetPlushes}
              tone={dockTones.reset}
            />
          </Animated.View>

          <Animated.View
            pointerEvents={focusedPlush ? 'auto' : 'none'}
            style={[
              styles.bottomButtonRow,
              styles.bottomButtonLayer,
              { opacity: focusDockOpacity, transform: [{ translateY: focusDockTranslateY }] },
            ]}>
              <View style={styles.focusSingleActionFrame}>
                <ActionButton
                  accessibilityLabel="Back to all plushies"
                  fontFamily={dockLabelFontFamily}
                  icon={(color) => <BackIcon color={color} />}
                  label="Back"
                  onPress={() => setFocusedPlushId(null)}
                  tone={FOCUS_DOCK_TONES.back}
                />
              </View>

              <View style={styles.focusPairedActionFrame}>
                <ActionButton
                  accessibilityLabel="Pet plush"
                  fontFamily={dockLabelFontFamily}
                  icon={(color) => <PetIcon color={color} />}
                  label="Pet"
                  onPress={petFocusedPlush}
                  tone={FOCUS_DOCK_TONES.pet}
                />

                <ActionButton
                  accessibilityLabel="Edit plush name"
                  fontFamily={dockLabelFontFamily}
                  icon={(color) => <EditIcon color={color} />}
                  label="Edit"
                  onPress={editFocusedPlushName}
                  tone={FOCUS_DOCK_TONES.edit}
                />

                <ActionButton
                  accessibilityLabel="Delete plush"
                  fontFamily={dockLabelFontFamily}
                  icon={(color) => <DeleteIcon color={color} />}
                  label="Delete"
                  onPress={deleteFocusedPlush}
                  tone={FOCUS_DOCK_TONES.delete}
                />
              </View>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FCF1E9',
  },
  playAreaOuter: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#FBF5EF',
    padding: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 7,
  },
  playAreaOuterParty: {
    padding: 0,
  },
  playAreaInner: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#FCF1E9',
  },
  previewFrame: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  playAreaDashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
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
  nameTag: {
    position: 'absolute',
    top: 0,
    zIndex: 6,
    alignSelf: 'center',
    borderRadius: 14,
    backgroundColor: '#FBF5EF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 7,
  },
  nameTagText: {
    color: '#C8741D',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
  },
  pettingOverlay: {
    position: 'absolute',
    zIndex: 7,
    left: 0,
    top: 0,
    width: PETTING_OVERLAY_WIDTH,
    height: 82,
  },
  pettingImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  trashButton: {
    position: 'absolute',
    zIndex: 6,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 35,
    backgroundColor: '#FF4650',
  },
  loadingPill: {
    position: 'absolute',
    zIndex: 6,
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
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 16,
  },
  bottomButtonStage: {
    height: 69,
  },
  bottomButtonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  bottomButtonLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  focusSingleActionFrame: {
    width: 82,
  },
  focusPairedActionFrame: {
    width: 262,
    flexDirection: 'row',
    gap: 8,
  },
  actionButtonOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FBF5EF',
    padding: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 7,
  },
  actionButtonInner: {
    width: 74,
    height: 61,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    gap: 4,
    padding: 0,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14,
    textAlign: 'center',
  },
  actionButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
});
