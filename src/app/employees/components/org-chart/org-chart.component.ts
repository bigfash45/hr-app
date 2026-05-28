import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface OrgNode {
  id: number;
  name: string;
  role: string;
  department: string;
  avatar: string;
  children?: OrgNode[];
}

@Component({
  selector: 'app-org-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './org-chart.component.html',
})
export class OrgChartComponent {
  orgData: OrgNode = {
    id: 1,
    name: 'Tolu Adeyemi',
    role: 'Chief Executive Officer',
    department: 'Executive',
    avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
    children: [
      {
        id: 2,
        name: 'Emmanuel Aforinwo',
        role: 'Chief Technology Officer',
        department: 'Technology',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        children: [
          {
            id: 5,
            name: 'Elvis Osuji',
            role: 'Backend Lead',
            department: 'Engineering',
            avatar: 'https://randomuser.me/api/portraits/men/45.jpg',
            children: [
              {
                id: 9,
                name: 'Ademeso Adedam',
                role: 'Backend Developer',
                department: 'Engineering',
                avatar: 'https://randomuser.me/api/portraits/men/22.jpg',
              },
              {
                id: 10,
                name: 'Joan Onyimadu',
                role: 'Backend Developer',
                department: 'Engineering',
                avatar: 'https://randomuser.me/api/portraits/women/65.jpg',
              }
            ]
          },
          {
            id: 6,
            name: 'Taiwo Adeife',
            role: 'Frontend Lead',
            department: 'Engineering',
            avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
            children: [
              {
                id: 11,
                name: 'Adeusi Victor',
                role: 'Frontend Developer',
                department: 'Engineering',
                avatar: 'https://randomuser.me/api/portraits/men/36.jpg',
              }
            ]
          }
        ]
      },
      {
        id: 3,
        name: 'Sarah Johnson',
        role: 'Chief Operations Officer',
        department: 'Operations',
        avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
        children: [
          {
            id: 7,
            name: 'Charlene Reed',
            role: 'QA Manager',
            department: 'Quality Assurance',
            avatar: 'https://randomuser.me/api/portraits/women/47.jpg',
            children: [
              {
                id: 12,
                name: 'Michael Brown',
                role: 'QA Engineer',
                department: 'Quality Assurance',
                avatar: 'https://randomuser.me/api/portraits/men/52.jpg',
              }
            ]
          }
        ]
      },
      {
        id: 4,
        name: 'David Williams',
        role: 'Chief Financial Officer',
        department: 'Finance',
        avatar: 'https://randomuser.me/api/portraits/men/55.jpg',
        children: [
          {
            id: 8,
            name: 'Emily Davis',
            role: 'Finance Manager',
            department: 'Finance',
            avatar: 'https://randomuser.me/api/portraits/women/33.jpg',
          }
        ]
      }
    ]
  };

  expandedNodes: Set<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

  toggleNode(id: number) {
    if (this.expandedNodes.has(id)) {
      this.expandedNodes.delete(id);
    } else {
      this.expandedNodes.add(id);
    }
  }

  isExpanded(id: number): boolean {
    return this.expandedNodes.has(id);
  }

  getDepartmentColor(department: string): string {
    const colors: { [key: string]: string } = {
      'Executive': 'bg-purple-100 text-purple-700 border-purple-200',
      'Technology': 'bg-blue-100 text-blue-700 border-blue-200',
      'Engineering': 'bg-green-100 text-green-700 border-green-200',
      'Operations': 'bg-orange-100 text-orange-700 border-orange-200',
      'Quality Assurance': 'bg-pink-100 text-pink-700 border-pink-200',
      'Finance': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    };
    return colors[department] || 'bg-gray-100 text-gray-700 border-gray-200';
  }
}
