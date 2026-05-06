import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Film, Wand2, User as UserIcon } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';
import { View, ActivityIndicator } from 'react-native';

export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/(auth)/login');
  }, [user, router]);

  if (user === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(18,18,24,0.95)',
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Studio',
          tabBarIcon: ({ color, size }) => <Film color={color} size={size} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="converter"
        options={{
          title: 'Toolbox',
          tabBarIcon: ({ color, size }) => <Wand2 color={color} size={size} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} strokeWidth={1.5} />,
        }}
      />
    </Tabs>
  );
}
