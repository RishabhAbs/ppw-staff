import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ledger } from './ledger.entity';
import { OrderDetail } from './order-detail.entity';
import { User } from './user.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true, unique: true })
  bill_number: string;

  @Column({ nullable: true })
  tally_master_id: string;

  @OneToMany(() => OrderDetail, (detail) => detail.order)
  orderDetails: OrderDetail[];

  @Index()
  @Column({
    type: 'enum',
    enum: ['inedit', 'pending', 'completed', 'fetched'],
    default: 'inedit',
  })
  status: 'inedit' | 'pending' | 'completed' | 'fetched';

  @ManyToOne(() => Ledger, { nullable: true })
  ledger: Ledger;

  @Column({ nullable: true })
  customer_name: string;

  @Column({ nullable: true })
  customer_address: string;

  @Column({ nullable: true })
  customer_phone: string;

  @Column({ nullable: true })
  customer_email: string;

  @Column({ nullable: true })
  customer_gstin: string;

  @Column({ nullable: true })
  customer_pincode: string;

  @Column({ nullable: true })
  customer_city: string;

  @Column({ nullable: true })
  customer_state: string;

  @Column({
    type: 'varchar',
    default: 'Tax Invoice',
  })
  order_type: string;

  @Index()
  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ nullable: true })
  created_by: number;

  @Column({ nullable: true, type: 'text' })
  remark: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: 'admin',
  })
  source: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount_given: number;

  @CreateDateColumn()
  created_at: Date;
}
