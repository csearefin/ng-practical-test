import { Component, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { setTheme } from 'ngx-bootstrap/utils';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  menus = signal([
    { title: 'Characters', url: '/characters' },
    { title: 'Boxes', url: '/boxes' },
  ]);

  constructor() {
    setTheme('bs5');
  }
}
