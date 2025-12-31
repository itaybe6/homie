import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Heart, X, Users, Home } from 'lucide-react-native';
import { Apartment, User } from '@/types/database';
import ApartmentCard from '@/components/ApartmentCard';

interface GroupCardProps {
	groupId: string;
	users: User[];
	apartment?: Apartment;
	onLike: (groupId: string, users: User[]) => void;
	onPass: (groupId: string, users: User[]) => void;
	onOpen: (userId: string) => void;
	onOpenApartment?: (apartmentId: string) => void;
}

export default function GroupCard({
	groupId,
	users,
	apartment,
	onLike,
	onPass,
	onOpen,
	onOpenApartment,
}: GroupCardProps) {
	return (
		<View style={styles.card}>
			<View style={styles.headerRow}>
				<View style={styles.headerLeft}>
					<Users size={18} color="#E5E7EB" />
					<Text style={styles.headerTitle}>פרופיל מאוחד</Text>
				</View>
				<View style={{ flex: 1 }} />
				<View style={styles.actionsRow}>
					<TouchableOpacity
						activeOpacity={0.9}
						style={[styles.actionBtn, styles.passBtn]}
						onPress={() => onPass(groupId, users)}
					>
						<X size={16} color="#F87171" />
						<Text style={[styles.actionText, styles.passText]}>דלג/י</Text>
					</TouchableOpacity>
					<TouchableOpacity
						activeOpacity={0.9}
						style={[styles.actionBtn, styles.likeBtn]}
						onPress={() => onLike(groupId, users)}
					>
						<Heart size={16} color="#FFFFFF" />
						<Text style={[styles.actionText, styles.likeText]}>אהבתי</Text>
					</TouchableOpacity>
				</View>
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.membersRow}
			>
				{users.map((u) => (
					<TouchableOpacity
						key={u.id}
						activeOpacity={0.9}
						style={styles.memberCard}
						onPress={() => onOpen(u.id)}
					>
						<Image
							source={{
								uri:
									u.avatar_url ||
									'https://cdn-icons-png.flaticon.com/512/847/847969.png',
							}}
							style={styles.memberAvatar}
						/>
						<Text style={styles.memberName} numberOfLines={1}>
							{u.full_name || 'משתמש/ת'}
						</Text>
					</TouchableOpacity>
				))}
			</ScrollView>

			{apartment ? (
				<View style={styles.apartmentSection}>
					<View style={styles.apartmentHeader}>
						<Home size={16} color="#E5E7EB" />
						<Text style={styles.apartmentTitle}>דירה משותפת</Text>
					</View>
					<ApartmentCard
						apartment={apartment}
						onPress={() =>
							onOpenApartment && onOpenApartment((apartment as any).id as string)
						}
					/>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: '#17171F',
		borderRadius: 16,
		overflow: 'hidden',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		marginBottom: 16,
	},
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		paddingTop: 12,
	},
	headerLeft: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		gap: 8,
	},
	headerTitle: {
		color: '#FFFFFF',
		fontSize: 15,
		fontWeight: '900',
	},
	actionsRow: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		gap: 8,
	},
	actionBtn: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 12,
		height: 36,
		borderRadius: 10,
		borderWidth: 1,
	},
	passBtn: {
		backgroundColor: 'rgba(248,113,113,0.12)',
		borderColor: 'rgba(248,113,113,0.35)',
	},
	likeBtn: {
		backgroundColor: '#5e3f2d',
		borderColor: '#5e3f2d',
	},
	actionText: {
		fontSize: 12,
		fontWeight: '800',
	},
	passText: {
		color: '#F87171',
	},
	likeText: {
		color: '#FFFFFF',
	},
	membersRow: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 10,
	},
	memberCard: {
		width: 90,
		alignItems: 'center',
		backgroundColor: '#1B1B24',
		borderRadius: 12,
		padding: 8,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
	},
	memberAvatar: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: '#22232E',
		marginBottom: 6,
	},
	memberName: {
		color: '#E5E7EB',
		fontSize: 12,
		fontWeight: '700',
		textAlign: 'center',
	},
	apartmentSection: {
		paddingHorizontal: 12,
		paddingBottom: 12,
	},
	apartmentHeader: {
		flexDirection: 'row-reverse',
		alignItems: 'center',
		gap: 8,
		marginBottom: 6,
	},
	apartmentTitle: {
		color: '#FFFFFF',
		fontSize: 14,
		fontWeight: '900',
	},
});


