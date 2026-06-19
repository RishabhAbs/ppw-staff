import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
} from 'typeorm';
import { Order } from './order.entity';

@Entity()
export class OrderDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Order)
  order: Order;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stock_item_id: string | null;

  @Column({ nullable: true })
  item_name: string;

  @Column({ nullable: true })
  barcode: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rate: number;

  @Column()
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gst: number;

  @Column({ nullable: true })
  selected_scheme: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount_percentage: number;

  @Column({ nullable: true })
  livestock_type: string;

  @Column({ nullable: true })
  parent: string;

  @Column({ nullable: true })
  group: string;

  @Column({ nullable: true })
  category: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status: string;
}
