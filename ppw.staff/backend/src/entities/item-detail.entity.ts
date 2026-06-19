import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('item_detail')
export class ItemDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  masterid: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  updated_by: number;

  @UpdateDateColumn()
  updated_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
