import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class GodownEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  godown: string; // 'shop' or 'pan'

  @Column()
  quantity: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  user_id: number;

  @Column({ nullable: true })
  user_name: string; // Persisted name for historical records

  // Relation Removed as per user request (Decoupled)
  @Column({ type: 'int', nullable: true })
  item_id: number;

  @Column()
  item_name: string; // Storing name for easier display
}
