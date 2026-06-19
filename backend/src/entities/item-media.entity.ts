import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('media')
export class ItemMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  masterid: string;

  @Column({ comment: 'img1, img2, img3, img4, vid1, vid2' })
  slot: string;

  @Column({ comment: 'image or video' })
  type: string;

  @Column({ comment: 'e.g. 000078img1 — itemcode + type + slot' })
  url_name: string;

  @Column({ nullable: true })
  uploaded_by: number;

  @CreateDateColumn()
  uploaded_at: Date;
}
