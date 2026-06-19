import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('item_video')
export class ItemVideo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  masterid: string;

  @Column({ type: 'int', comment: 'Sequential slot 1-2' })
  video_slot: number;

  @Column()
  video_url: string;

  @Column({ nullable: true })
  original_name: string;

  @Column({ type: 'float', nullable: true })
  duration: number;

  @Column({ nullable: true })
  uploaded_by: number;

  @CreateDateColumn()
  uploaded_at: Date;
}
