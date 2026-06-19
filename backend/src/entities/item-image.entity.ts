import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('item_image')
export class ItemImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  masterid: string;

  @Column({ type: 'int', comment: 'Sequential slot 1-4' })
  image_slot: number;

  @Column()
  image_url: string;

  @Column({ nullable: true })
  original_name: string;

  @Column({ nullable: true })
  uploaded_by: number;

  @CreateDateColumn()
  uploaded_at: Date;
}
