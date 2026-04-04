import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type RowProps = {
  icon: React.ComponentProps<typeof IconSymbol>['name'];
  label: string;
  onPress: () => void;
  tint: string;
  destructive?: boolean;
};

function SettingsRow({ icon, label, onPress, tint, destructive }: RowProps) {
  const color = destructive ? '#FF3B30' : tint;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, { backgroundColor: color }]}>
        <IconSymbol name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.rowLabel, destructive && styles.destructiveLabel]}>{label}</Text>
      {!destructive && <IconSymbol name="chevron.right" size={16} color="#C7C7CC" />}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>;
}

export default function ProfileScreen() {
  const { session, isAnonymous } = useSession();
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const bg = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;
  const iconColor = Colors[colorScheme].icon;
  const router = useRouter();

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) Alert.alert('Error', error.message);
        },
      },
    ]);
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: Colors[colorScheme].background === '#fff' ? '#F2F2F7' : '#1C1C1E' }]}>
      {/* Account card */}
      <View style={[styles.accountCard, { backgroundColor: bg }]}>
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <Text style={styles.avatarText}>
            {isAnonymous ? '?' : (session?.user.email?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.accountInfo}>
          <Text style={[styles.accountName, { color: textColor }]}>
            {isAnonymous ? 'Guest' : (session?.user.email ?? 'Unknown')}
          </Text>
          <Text style={[styles.accountSubtitle, { color: iconColor }]}>
            {isAnonymous ? 'Guest account — data is local only' : 'Registered account'}
          </Text>
        </View>
      </View>

      {isAnonymous ? (
        <>
          <SectionHeader title="Save your data" />
          <View style={[styles.section, { backgroundColor: bg }]}>
            <SettingsRow
              icon="person.badge.plus"
              label="Create Account"
              onPress={() => router.push('/(app)/upgrade')}
              tint={tint}
            />
          </View>
          <Text style={[styles.sectionFooter, { color: iconColor }]}>
            Link an email and password to keep your ratings and groups across devices.
            Your existing data won't be lost.
          </Text>
        </>
      ) : (
        <>
          <SectionHeader title="Account" />
          <View style={[styles.section, { backgroundColor: bg }]}>
            <SettingsRow
              icon="envelope.fill"
              label="Change Email"
              onPress={() => router.push('/(app)/change-email')}
              tint={tint}
            />
            <View style={[styles.separator, { backgroundColor: Colors[colorScheme].icon + '30' }]} />
            <SettingsRow
              icon="lock.fill"
              label="Change Password"
              onPress={() => router.push('/(app)/change-password')}
              tint={tint}
            />
          </View>
        </>
      )}

      <SectionHeader title="Session" />
      <View style={[styles.section, { backgroundColor: bg }]}>
        <SettingsRow
          icon="arrow.right.square"
          label="Sign Out"
          onPress={signOut}
          tint={tint}
          destructive
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  accountInfo: {
    flex: 1,
    gap: 3,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '600',
  },
  accountSubtitle: {
    fontSize: 13,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    marginHorizontal: 32,
    marginTop: 20,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  sectionFooter: {
    fontSize: 13,
    marginHorizontal: 32,
    marginTop: 6,
    lineHeight: 18,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  destructiveLabel: {
    color: '#FF3B30',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
});
